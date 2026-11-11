#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>
#include <math.h>

#include "config.h"

// =============================================================================
// KHỞI TẠO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
// =============================================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

Adafruit_AHTX0 aht20;

// Cờ kiểm tra cảm biến vật lý có đang cắm hay không
bool hasRealAHT20 = false;

// Trạng thái cơ cấu chấp hành (Relay 2 kênh) và An ninh cửa
bool fanState = false;            // Relay Kênh 1 (GPIO 25): false = OFF, true = ON
bool buzzerState = false;         // Relay Kênh 2 (GPIO 33): false = OFF, true = ON
bool isDoorOpen = false;          // Cảm biến cửa (GPIO 27): false = CLOSED, true = OPEN
String controlMode = "AUTO";      // "AUTO" hoặc "MANUAL"
String currentRiskLevel = "SAFE"; // "SAFE", "WARNING", "HIGH_RISK"

// Dữ liệu vi khí hậu hiện tại
float currentTemperature = 24.0f;
float currentHumidity = 60.0f;
float currentGasPPM = 400.0f;
float currentEMC = 12.5f;

// Các bộ định thời (Non-blocking timers với millis)
unsigned long lastTelemetryTime = 0;
unsigned long lastMqttRetryTime = 0;
unsigned long lastStatusHeartbeatTime = 0;
unsigned long samplingIntervalMs = DEFAULT_SAMPLING_INTERVAL_MS;

// Topic MQTT động theo DEVICE_ID
String topicTelemetry = String("grain/devices/") + DEVICE_ID + "/telemetry";
String topicStatus    = String("grain/devices/") + DEVICE_ID + "/status";
String topicCmd       = String("grain/devices/") + DEVICE_ID + "/cmd";
String topicAck       = String("grain/devices/") + DEVICE_ID + "/ack";

// =============================================================================
// HÀM TÍNH TOÁN ĐỘ ẨM CÂN BẰNG HẠT (EMC) THEO MÔ HÌNH HALSEY / TCVN 8370
// =============================================================================
float calculateHalseyEMC(float tempC, float rhPercent) {
  float rhClamped = constrain(rhPercent, 1.0f, 99.0f);
  float rhDec = rhClamped / 100.0f;
  float num = -log(1.0f - rhDec);
  float den = 0.000105f * (tempC + 35.0f);
  if (den <= 0) return 12.0f;
  float emc = sqrt(num / den);
  return round(emc * 10.0f) / 10.0f;
}

// =============================================================================
// ĐIỀU KHIỂN MODULE RELAY 2 KÊNH (KÊNH 1: QUẠT GPIO 25 | KÊNH 2: CÒI GPIO 33)
// =============================================================================
void setFanRelay(bool enable) {
  fanState = enable;
  if (RELAY_ACTIVE_LEVEL == HIGH) {
    digitalWrite(PIN_RELAY_FAN, enable ? HIGH : LOW);
  } else {
    digitalWrite(PIN_RELAY_FAN, enable ? LOW : HIGH);
  }
}

void setBuzzer(bool enable) {
  buzzerState = enable;
  if (RELAY_ACTIVE_LEVEL == HIGH) {
    digitalWrite(PIN_RELAY_BUZZER, enable ? HIGH : LOW);
  } else {
    digitalWrite(PIN_RELAY_BUZZER, enable ? LOW : HIGH);
  }
}

void updateRiskIndicators(const String& risk) {
  currentRiskLevel = risk;
  if (risk == "HIGH_RISK") {
    setBuzzer(true);
  } else {
    setBuzzer(false);
  }
}

// =============================================================================
// ĐỌC CẢM BIẾN (AHT20, MQ-135 QUA CHIA ÁP 15k+10k, CẢM BIẾN TỪ CỬA)
// =============================================================================
void readSensors() {
  // 1. Đọc Cảm biến Nhiệt độ & Độ ẩm AHT20 (Bus I2C GPIO 21, 22)
  if (hasRealAHT20) {
    sensors_event_t humidityEvent, tempEvent;
    aht20.getEvent(&humidityEvent, &tempEvent);
    float t = tempEvent.temperature;
    float h = humidityEvent.relative_humidity;
    if (!isnan(t) && !isnan(h) && t >= -40.0f && t <= 85.0f && h >= 0.0f && h <= 100.0f) {
      currentTemperature = round(t * 10.0f) / 10.0f;
      currentHumidity = round(h * 10.0f) / 10.0f;
    }
  } else {
    // Chế độ mô phỏng an toàn khi chưa cắm cảm biến vật lý
    currentTemperature = 24.2f + (random(-5, 6) / 10.0f);
    currentHumidity = 61.5f + (random(-8, 9) / 10.0f);
  }

  // 2. Đọc Cảm biến khí Gas MQ-135 từ kênh ADC1 (GPIO 34)
  // Có mạch chia áp 15kΩ + 10kΩ: 5V -> 2.0V (~2480 ADC trên dải 0..4095 của 3.3V)
  int rawADC = analogRead(PIN_MQ135_ANALOG);
  if (rawADC > 80) {
    int clampedADC = constrain(rawADC, 80, 2500);
    currentGasPPM = map(clampedADC, 80, 2500, 300, 1200);
  } else {
    currentGasPPM = 405.0f + random(-10, 11);
  }

  // 3. Đọc Cảm biến từ cửa kho (GPIO 27)
  int doorVal = digitalRead(PIN_DOOR_SENSOR);
  isDoorOpen = (doorVal == HIGH);

  // 4. Tính toán Độ ẩm cân bằng hạt (EMC) theo Halsey
  currentEMC = calculateHalseyEMC(currentTemperature, currentHumidity);

  // 5. Đánh giá mức rủi ro theo ngưỡng TCVN 8370:2018
  String evaluatedRisk = "SAFE";
  if (currentHumidity >= THRESHOLD_HUM_CRIT || currentTemperature >= THRESHOLD_TEMP_CRIT ||
      currentEMC >= THRESHOLD_EMC_CRIT || currentGasPPM >= THRESHOLD_GAS_CRIT) {
    evaluatedRisk = "HIGH_RISK";
  } else if (currentHumidity >= THRESHOLD_HUM_WARN || currentTemperature >= THRESHOLD_TEMP_WARN ||
             currentEMC >= THRESHOLD_EMC_WARN || currentGasPPM >= THRESHOLD_GAS_WARN) {
    evaluatedRisk = "WARNING";
  }

  updateRiskIndicators(evaluatedRisk);

  // Vận hành tự chủ tại biên: Khi ở chế độ AUTO, vượt ngưỡng -> BẬT quạt, an toàn -> TẮT quạt
  if (controlMode == "AUTO") {
    if (evaluatedRisk == "WARNING" || evaluatedRisk == "HIGH_RISK") {
      setFanRelay(true);
    } else {
      setFanRelay(false);
    }
  }
}

// =============================================================================
// GỬI BẢN TIN TRẠNG THÁI /status VÀ TELEMETRY /telemetry
// =============================================================================
void sendStatusHeartbeat() {
  if (!mqttClient.connected()) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<512> doc;
#endif

  doc["device_id"]  = DEVICE_ID;
  doc["state"]      = "ONLINE";
  doc["ip_address"] = WiFi.localIP().toString();
  doc["fw_version"] = FIRMWARE_VERSION;
  doc["hw_version"] = HARDWARE_VERSION;
  doc["uptime_sec"] = millis() / 1000;
  doc["timestamp"]  = millis();

  char buffer[512];
  serializeJson(doc, buffer);
  mqttClient.publish(topicStatus.c_str(), buffer, true); // Retain flag
  Serial.printf("📡 [MQTT] Da phat ban tin Heartbeat ONLINE len %s\n", topicStatus.c_str());
}

void sendTelemetry() {
  if (!mqttClient.connected()) return;

  unsigned long nowSec = millis() / 1000;
  String msgId = "msg_esp_" + String(nowSec) + "_" + String(random(100, 999));

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<768> doc;
#endif

  doc["msg_id"]     = msgId;
  doc["device_id"]  = DEVICE_ID;
  doc["fw_version"] = FIRMWARE_VERSION;
  doc["timestamp"]  = millis();

  // Metrics (Nhiệt độ, Độ ẩm không khí, Khí Gas, Độ ẩm hạt EMC)
  JsonObject metrics = doc.createNestedObject("metrics");
  JsonObject mTemp = metrics.createNestedObject("temperature");
  mTemp["value"] = currentTemperature;
  mTemp["unit"]  = "C";

  JsonObject mHum = metrics.createNestedObject("humidity_air");
  mHum["value"] = currentHumidity;
  mHum["unit"]  = "%RH";

  JsonObject mGas = metrics.createNestedObject("gas_ppm");
  mGas["value"] = currentGasPPM;
  mGas["unit"]  = "ppm";

  JsonObject mEMC = metrics.createNestedObject("estimated_emc");
  mEMC["value"] = currentEMC;
  mEMC["unit"]  = "%MC";

  // Actuators & Risk Level
  JsonObject actuators = doc.createNestedObject("actuators");
  actuators["fan_state"]    = fanState ? "ON" : "OFF";
  actuators["buzzer_state"] = buzzerState ? "ON" : "OFF";
  actuators["door_open"]    = isDoorOpen ? "OPEN" : "CLOSED";
  actuators["control_mode"] = controlMode;
  actuators["risk_level"]   = currentRiskLevel;

  doc["rssi"] = WiFi.RSSI();

  char buffer[768];
  serializeJson(doc, buffer);
  mqttClient.publish(topicTelemetry.c_str(), buffer, false);

  Serial.printf("📊 [Telemetry] T=%.1fC | RH=%.1f%% | EMC=%.1f%% | Gas=%.0f ppm | Fan=%s | Còi=%s | Cửa=%s | Risk=%s\n",
                currentTemperature, currentHumidity, currentEMC, currentGasPPM,
                fanState ? "ON" : "OFF", buzzerState ? "ON" : "OFF",
                isDoorOpen ? "OPEN" : "CLOSED", currentRiskLevel.c_str());
}

// =============================================================================
// XỬ LÝ LỆNH ĐIỀU KHIỂN TỪ BACKEND (/cmd) VÀ PHẢN HỒI ACK (/ack)
// =============================================================================
void handleIncomingCommand(char* topic, byte* payload, unsigned int length) {
  char jsonBuffer[512];
  if (length >= sizeof(jsonBuffer)) length = sizeof(jsonBuffer) - 1;
  memcpy(jsonBuffer, payload, length);
  jsonBuffer[length] = '\0';

  Serial.printf("📥 [MQTT Command] Nhan lenh tu topic %s: %s\n", topic, jsonBuffer);

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument cmdDoc;
#else
  StaticJsonDocument<512> cmdDoc;
#endif

  DeserializationError error = deserializeJson(cmdDoc, jsonBuffer);
  if (error) {
    Serial.println("❌ [MQTT] Giai ma JSON lenh that bai!");
    return;
  }

  const char* cmdId = cmdDoc["cmd_id"];
  const char* cmdType = cmdDoc["type"];
  JsonObject payloadObj = cmdDoc["payload"];

  String ackMessage = "Lenh thuc thi thanh cong";

  if (cmdType && strcmp(cmdType, "ACTUATOR_CONTROL") == 0) {
    const char* action = payloadObj["action"];
    const char* target = payloadObj["target"];
    const char* mode = payloadObj["control_mode"];

    if (mode) controlMode = String(mode);

    if (!target || strcmp(target, "VENTILATION_FAN") == 0) {
      if (action && strcmp(action, "TURN_ON") == 0) {
        setFanRelay(true);
        ackMessage = "Relay 1 (GPIO 25) da BAT Quat thong gio";
      } else if (action && strcmp(action, "TURN_OFF") == 0) {
        setFanRelay(false);
        ackMessage = "Relay 1 (GPIO 25) da TAT Quat thong gio";
      }
    }
  } else if (cmdType && strcmp(cmdType, "UPDATE_CONFIG") == 0) {
    unsigned long interval = payloadObj["sampling_interval_ms"];
    if (interval >= 1000) {
      samplingIntervalMs = interval;
      ackMessage = "Da cap nhat chu ky lay mau: " + String(samplingIntervalMs) + "ms";
    }
  }

  // Tự động phản hồi bản tin xác nhận /ack sau 300ms
  delay(300);

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument ackDoc;
#else
  StaticJsonDocument<512> ackDoc;
#endif

  ackDoc["cmd_id"]      = cmdId ? cmdId : "cmd_unknown";
  ackDoc["device_id"]   = DEVICE_ID;
  ackDoc["status"]      = "SUCCESS";
  ackDoc["executed_at"] = millis();

  JsonObject currentActs = ackDoc.createNestedObject("current_actuators");
  currentActs["fan_state"]    = fanState ? "ON" : "OFF";
  currentActs["buzzer_state"] = buzzerState ? "ON" : "OFF";
  currentActs["control_mode"] = controlMode;

  ackDoc["message"] = ackMessage;

  char ackBuffer[512];
  serializeJson(ackDoc, ackBuffer);
  mqttClient.publish(topicAck.c_str(), ackBuffer, false);

  Serial.printf("📤 [MQTT ACK] Da gui phan hoi ACK: %s\n", ackMessage.c_str());
}

// =============================================================================
// QUẢN LÝ KẾT NỐI WI-FI VÀ MQTT BROKER (NON-BLOCKING AUTO-RECONNECT)
// =============================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("📡 [Wi-Fi] Dang ket noi toi SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n✅ [Wi-Fi] Ket noi thanh cong! IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\n⚠️ [Wi-Fi] Chua the ket noi Wi-Fi, se thu lai ngam...");
  }
}

void connectMQTT() {
  if (mqttClient.connected() || WiFi.status() != WL_CONNECTED) return;

  Serial.printf("🔌 [MQTT] Dang ket noi toi Broker: %s:%d...\n", MQTT_SERVER_IP, MQTT_SERVER_PORT);

  // Chuẩn bị bản tin Last Will and Testament (LWT) khi thiết bị đứt kết nối đột ngột
  String lwtPayload = "{\"device_id\":\"" + String(DEVICE_ID) + "\",\"state\":\"OFFLINE\"}";

  bool success = false;
  if (strlen(MQTT_USERNAME) > 0) {
    success = mqttClient.connect(DEVICE_ID, MQTT_USERNAME, MQTT_PASSWORD,
                                 topicStatus.c_str(), 1, true, lwtPayload.c_str());
  } else {
    success = mqttClient.connect(DEVICE_ID, topicStatus.c_str(), 1, true, lwtPayload.c_str());
  }

  if (success) {
    Serial.println("✅ [MQTT] Ket noi MQTT Broker thanh cong!");

    // Subscribe nhận lệnh điều khiển từ Backend (/cmd)
    mqttClient.subscribe(topicCmd.c_str(), 1);
    Serial.printf("📡 [MQTT] Da subscribe topic dieu khien: %s\n", topicCmd.c_str());

    // Phát bản tin ONLINE đầu tiên
    sendStatusHeartbeat();
  } else {
    Serial.printf("❌ [MQTT] Ket noi that bai, ma loi rc=%d\n", mqttClient.state());
  }
}

// =============================================================================
// SETUP KHỞI TẠO HỆ THỐNG
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================================");
  Serial.printf("🌾 SMART GRAIN STORAGE IOT NODE - %s (TCVN 8370)\n", DEVICE_ID);
  Serial.printf("Firmware v%s | Hardware: %s\n", FIRMWARE_VERSION, HARDWARE_VERSION);
  Serial.println("========================================================");

  // 1. Cấu hình các chân GPIO cơ cấu chấp hành Relay 2 kênh & Cảm biến cửa
  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_BUZZER, OUTPUT);
  pinMode(PIN_DOOR_SENSOR, INPUT);

  // Trạng thái ban đầu: Tắt quạt (GPIO 25), tắt còi (GPIO 33)
  setFanRelay(false);
  setBuzzer(false);
  updateRiskIndicators("SAFE");

  // 2. Khởi tạo Bus I2C (SDA = GPIO 21, SCL = GPIO 22)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  // 3. Khởi tạo Cảm biến nhiệt độ & độ ẩm AHT20
  if (aht20.begin()) {
    hasRealAHT20 = true;
    Serial.println("✅ [Hardware] Cam bien nhiet am AHT20 san sang (I2C 0x38)!");
  } else {
    Serial.println("⚠️ [Hardware] Khong tim thay AHT20! Tu dong chay Che Do Gia Lap Test an toan.");
  }

  // 4. Cấu hình MQTT Client
  mqttClient.setServer(MQTT_SERVER_IP, MQTT_SERVER_PORT);
  mqttClient.setCallback(handleIncomingCommand);
  mqttClient.setBufferSize(768);

  // 5. Kết nối Wi-Fi và MQTT Broker
  connectWiFi();
  connectMQTT();
}

// =============================================================================
// VÒNG LẶP CHÍNH (NON-BLOCKING MAIN LOOP)
// =============================================================================
void loop() {
  unsigned long currentMillis = millis();

  // A. Duy trì kết nối Wi-Fi và MQTT mỗi 5 giây nếu bị rớt mạng
  if (currentMillis - lastMqttRetryTime >= 5000) {
    lastMqttRetryTime = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    } else if (!mqttClient.connected()) {
      connectMQTT();
    }
  }

  // B. Giữ nhịp MQTT Client loop
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  // C. Đọc cảm biến định kỳ và gửi Telemetry
  if (currentMillis - lastTelemetryTime >= samplingIntervalMs) {
    lastTelemetryTime = currentMillis;
    readSensors();
    sendTelemetry();
  }

  // D. Gửi Heartbeat định kỳ mỗi 30 giây để duy trì Online
  if (currentMillis - lastStatusHeartbeatTime >= 30000) {
    lastStatusHeartbeatTime = currentMillis;
    sendStatusHeartbeat();
  }
}
