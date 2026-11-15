#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <math.h>

#include "config.h"

// =============================================================================
// KHỞI TẠO ĐỐI TƯỢNG VÀ BIẾN TOÀN CỤC
// =============================================================================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;

// Cấu hình bật/tắt từng module & ngưỡng động (đồng bộ từ Web, lưu vào NVS Flash)
bool cfgAht20Enabled  = true;
bool cfgMq135Enabled  = true;
bool cfgDoorEnabled   = true;
bool cfgFanEnabled    = true;
bool cfgBuzzerEnabled = true;
bool cfgBuzzerAuto    = true;

float cfgTempWarn = THRESHOLD_TEMP_WARN;
float cfgTempCrit = THRESHOLD_TEMP_CRIT;
float cfgHumWarn  = THRESHOLD_HUM_WARN;
float cfgHumCrit  = THRESHOLD_HUM_CRIT;
float cfgGasWarn  = THRESHOLD_GAS_WARN;
float cfgGasCrit  = THRESHOLD_GAS_CRIT;
float cfgEmcWarn  = THRESHOLD_EMC_WARN;
float cfgEmcCrit  = THRESHOLD_EMC_CRIT;

// Cảm biến nhiệt ẩm AHT20 (I2C 0x38)
Adafruit_AHTX0 aht;

// Cờ kiểm tra phần cứng vật lý và chẩn đoán cảm biến
bool hasRealAHT = false;
bool aht20Connected = false;
String aht20Status = "DISCONNECTED";   // "OK", "DISCONNECTED", "READ_ERROR", "SIMULATED"
String aht20Message = "Chua khoi tao";

bool mq135Connected = false;
String mq135Status = "DISCONNECTED";   // "OK", "DISCONNECTED", "OUT_OF_RANGE", "SIMULATED"
String mq135Message = "Chua doc du lieu";
int lastMq135RawAdc = 0;

int lastDoorRawLogic = HIGH;

// Trạng thái cơ cấu chấp hành (Relay 2 kênh) và cảm biến từ cửa
bool fanState = false;            // Kênh 1 (IN1): false = OFF, true = ON
bool buzzerState = false;         // Kênh 2 (IN2): false = OFF, true = ON
bool buzzerManualOverride = false;// Cho phép bật/tắt còi thủ công để test từ Web
bool isDoorOpen = false;          // false = Cửa đóng, true = Cửa mở
String controlMode = "AUTO";      // "AUTO" hoặc "MANUAL"
String currentRiskLevel = "SAFE"; // "SAFE", "WARNING", "HIGH_RISK"

// Dữ liệu vi khí hậu hiện tại
float currentTemperature = 24.0f;
float currentHumidity = 60.0f;
float currentGasPPM = 400.0f;     // Nồng độ khí gas lên men (ppm)
float currentEMC = 12.5f;         // Độ ẩm cân bằng hạt (%MC - TCVN)

// Các bộ định thời (Non-blocking timers với millis)
unsigned long lastTelemetryTime = 0;
unsigned long lastMqttRetryTime = 0;
unsigned long lastStatusHeartbeatTime = 0;
unsigned long samplingIntervalMs = DEFAULT_SAMPLING_INTERVAL_MS;

// Định danh thực tế của Node (tính tại setup() theo DEVICE_ID hoặc MAC chip)
String runtimeDeviceId   = DEVICE_ID;
String runtimeMacAddress = "";
String runtimeChipId     = "";

// Topic MQTT động theo runtimeDeviceId
String topicTelemetry = String("grain/devices/") + DEVICE_ID + "/telemetry";
String topicStatus    = String("grain/devices/") + DEVICE_ID + "/status";
String topicCmd       = String("grain/devices/") + DEVICE_ID + "/cmd";
String topicAck       = String("grain/devices/") + DEVICE_ID + "/ack";

void initDeviceIdentity() {
  WiFi.mode(WIFI_STA);
  runtimeMacAddress = WiFi.macAddress();

  uint64_t efuseMac = ESP.getEfuseMac();
  char chipBuf[13];
  snprintf(chipBuf, sizeof(chipBuf), "%04X%08lX",
           (uint16_t)(efuseMac >> 32), (unsigned long)(efuseMac & 0xFFFFFFFFUL));
  runtimeChipId = String(chipBuf);

#if USE_MAC_AS_DEVICE_ID
  String compactMac = runtimeMacAddress;
  compactMac.replace(":", "");
  compactMac.toUpperCase();
  String suffix = compactMac.length() >= 6
                    ? compactMac.substring(compactMac.length() - 6)
                    : runtimeChipId.substring(0, 6);
  runtimeDeviceId = String("ESP32_") + suffix;
#else
  runtimeDeviceId = String(DEVICE_ID);
#endif

  topicTelemetry = String("grain/devices/") + runtimeDeviceId + "/telemetry";
  topicStatus    = String("grain/devices/") + runtimeDeviceId + "/status";
  topicCmd       = String("grain/devices/") + runtimeDeviceId + "/cmd";
  topicAck       = String("grain/devices/") + runtimeDeviceId + "/ack";
}

void loadConfigFromNVS() {
  if (!preferences.begin("grain_cfg", true)) return;
  samplingIntervalMs = preferences.getULong("interval", DEFAULT_SAMPLING_INTERVAL_MS);
  if (samplingIntervalMs < 1000) samplingIntervalMs = DEFAULT_SAMPLING_INTERVAL_MS;

  cfgAht20Enabled  = preferences.getBool("en_aht", true);
  cfgMq135Enabled  = preferences.getBool("en_mq", true);
  cfgDoorEnabled   = preferences.getBool("en_door", true);
  cfgFanEnabled    = preferences.getBool("en_fan", true);
  cfgBuzzerEnabled = preferences.getBool("en_buz", true);
  cfgBuzzerAuto    = preferences.getBool("auto_buz", true);
  controlMode      = preferences.getBool("auto_fan", true) ? "AUTO" : "MANUAL";

  cfgTempWarn = preferences.getFloat("t_warn", THRESHOLD_TEMP_WARN);
  cfgTempCrit = preferences.getFloat("t_crit", THRESHOLD_TEMP_CRIT);
  cfgHumWarn  = preferences.getFloat("h_warn", THRESHOLD_HUM_WARN);
  cfgHumCrit  = preferences.getFloat("h_crit", THRESHOLD_HUM_CRIT);
  cfgGasWarn  = preferences.getFloat("g_warn", THRESHOLD_GAS_WARN);
  cfgGasCrit  = preferences.getFloat("g_crit", THRESHOLD_GAS_CRIT);
  cfgEmcWarn  = preferences.getFloat("e_warn", THRESHOLD_EMC_WARN);
  cfgEmcCrit  = preferences.getFloat("e_crit", THRESHOLD_EMC_CRIT);
  preferences.end();

  Serial.printf("💾 [NVS] Da nap cau hinh: interval=%lums | AHT=%d MQ=%d DOOR=%d FAN=%d(mode=%s) BUZ=%d(auto=%d)\n",
                samplingIntervalMs, cfgAht20Enabled, cfgMq135Enabled, cfgDoorEnabled,
                cfgFanEnabled, controlMode.c_str(), cfgBuzzerEnabled, cfgBuzzerAuto);
}

void saveConfigToNVS() {
  if (!preferences.begin("grain_cfg", false)) return;
  preferences.putULong("interval", samplingIntervalMs);
  preferences.putBool("en_aht", cfgAht20Enabled);
  preferences.putBool("en_mq", cfgMq135Enabled);
  preferences.putBool("en_door", cfgDoorEnabled);
  preferences.putBool("en_fan", cfgFanEnabled);
  preferences.putBool("en_buz", cfgBuzzerEnabled);
  preferences.putBool("auto_buz", cfgBuzzerAuto);
  preferences.putBool("auto_fan", controlMode == "AUTO");

  preferences.putFloat("t_warn", cfgTempWarn);
  preferences.putFloat("t_crit", cfgTempCrit);
  preferences.putFloat("h_warn", cfgHumWarn);
  preferences.putFloat("h_crit", cfgHumCrit);
  preferences.putFloat("g_warn", cfgGasWarn);
  preferences.putFloat("g_crit", cfgGasCrit);
  preferences.putFloat("e_warn", cfgEmcWarn);
  preferences.putFloat("e_crit", cfgEmcCrit);
  preferences.end();
}

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
// ĐIỀU KHIỂN MODULE RELAY 2 KÊNH (K1: QUẠT 5V | K2: CÒI 5V)
// =============================================================================
static void setRelayPin(uint8_t pin, bool enable) {
  bool level = (RELAY_ACTIVE_LEVEL == LOW) ? !enable : enable;
  digitalWrite(pin, level ? HIGH : LOW);
}

void setFanRelay(bool enable) {
  fanState = enable;
  setRelayPin(PIN_RELAY_FAN, enable);
}

void setBuzzerRelay(bool enable) {
  buzzerState = enable;
  setRelayPin(PIN_RELAY_BUZZER, enable);
}

// =============================================================================
// ĐỌC CẢM BIẾN & KIỂM TRA SỨC KHỎE PHẦN CỨNG (AHT20, MQ-135, CỬA)
// =============================================================================
bool isI2CDevicePresent(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

void readSensors() {
  // 1. Kiểm tra & đọc Cảm biến Nhiệt độ & Độ ẩm AHT20 (I2C 0x38, nguồn 3.3V)
  if (!cfgAht20Enabled) {
    hasRealAHT = false;
    aht20Connected = false;
    aht20Status = "DISABLED";
    aht20Message = "Da vo hieu hoa theo doi AHT20 tu Web";
    currentTemperature = 0.0f;
    currentHumidity = 0.0f;
  } else {
    bool ahtPresent = isI2CDevicePresent(AHT20_I2C_ADDR);
    if (!ahtPresent) {
      if (hasRealAHT) {
        Serial.println("❌ [Hardware] Mat ket noi cam bien AHT20 tren bus I2C (0x38)!");
      }
      hasRealAHT = false;
      aht20Connected = false;
      aht20Status = ENABLE_SENSOR_SIMULATION_FALLBACK ? "SIMULATED" : "DISCONNECTED";
      aht20Message = "Khong tim thay AHT20 tai I2C 0x38 (kiem tra SDA=21, SCL=22, 3.3V)";
    } else {
      if (!hasRealAHT) {
        if (aht.begin(&Wire, 0, AHT20_I2C_ADDR)) {
          hasRealAHT = true;
          Serial.println("🔄 [Hardware] Da nhan dien va ket noi lai cam bien AHT20 (I2C 0x38)!");
        } else {
          aht20Connected = false;
          aht20Status = "READ_ERROR";
          aht20Message = "Thay dia chi I2C 0x38 nhung khoi tao AHT20 that bai";
        }
      }

      if (hasRealAHT) {
        sensors_event_t humidityEvent, tempEvent;
        bool readOk = aht.getEvent(&humidityEvent, &tempEvent);
        float t = tempEvent.temperature;
        float h = humidityEvent.relative_humidity;

        if (readOk && !isnan(t) && !isnan(h) && t >= -40.0f && t <= 85.0f && h >= 0.0f && h <= 100.0f) {
          currentTemperature = round(t * 10.0f) / 10.0f;
          currentHumidity = round(h * 10.0f) / 10.0f;
          aht20Connected = true;
          aht20Status = "OK";
          aht20Message = "Ket noi I2C 0x38 on dinh";
        } else {
          aht20Connected = false;
          hasRealAHT = false;
          aht20Status = "READ_ERROR";
          aht20Message = "Loi doc du lieu tu AHT20 (NaN / ngoai dai do)";
        }
      }
    }

    if (!aht20Connected) {
      if (ENABLE_SENSOR_SIMULATION_FALLBACK) {
        aht20Status = "SIMULATED";
        currentTemperature = 24.2f + (random(-5, 6) / 10.0f);
        currentHumidity = 61.5f + (random(-8, 9) / 10.0f);
      } else {
        currentTemperature = 0.0f;
        currentHumidity = 0.0f;
      }
    }
  }

  // 2. Kiểm tra & đọc Cảm biến MQ-135 (GPIO 34 qua cầu chia áp 15kΩ + 10kΩ)
  if (!cfgMq135Enabled) {
    mq135Connected = false;
    mq135Status = "DISABLED";
    mq135Message = "Da vo hieu hoa theo doi MQ-135 tu Web";
    lastMq135RawAdc = 0;
    currentGasPPM = 0.0f;
  } else {
    long adcSum = 0;
    for (int i = 0; i < 8; i++) {
      adcSum += analogRead(PIN_MQ135_ANALOG);
      delayMicroseconds(200);
    }
    int rawADC = (int)(adcSum / 8);
    lastMq135RawAdc = rawADC;

    if (rawADC >= MQ135_ADC_MIN_VALID && rawADC <= MQ135_ADC_MAX_VALID) {
      mq135Connected = true;
      mq135Status = "OK";
      mq135Message = "Tin hieu ADC on dinh tren GPIO 34";
      int clampedADC = constrain(rawADC, MQ135_ADC_MIN_VALID, MQ135_ADC_MAX);
      currentGasPPM = map(clampedADC, MQ135_ADC_MIN_VALID, MQ135_ADC_MAX, 300, 1200);
    } else if (rawADC > MQ135_ADC_MAX_VALID) {
      mq135Connected = false;
      mq135Status = "OUT_OF_RANGE";
      mq135Message = "ADC vuot nguong chia ap (>3500) - Kiem tra 15k+10k / cham nguon";
      currentGasPPM = ENABLE_SENSOR_SIMULATION_FALLBACK ? (405.0f + random(-10, 11)) : 0.0f;
    } else {
      mq135Connected = false;
      mq135Status = ENABLE_SENSOR_SIMULATION_FALLBACK ? "SIMULATED" : "DISCONNECTED";
      mq135Message = "ADC qua thap (<25) - Chua cam day AO hoac mat nguon 5V MQ-135";
      currentGasPPM = ENABLE_SENSOR_SIMULATION_FALLBACK ? (405.0f + random(-10, 11)) : 0.0f;
    }
  }

  // 3. Đọc Cảm biến từ cửa kho (Digital D0 - GPIO 27)
  if (!cfgDoorEnabled) {
    lastDoorRawLogic = LOW;
    isDoorOpen = false;
  } else {
    lastDoorRawLogic = digitalRead(PIN_DOOR_SENSOR);
    isDoorOpen = (lastDoorRawLogic == DOOR_STATE_OPEN_LOGIC);
  }

  // 4. Tính toán độ ẩm hạt Halsey EMC (chỉ tính khi bật và có AHT20 hoặc đang bật fallback mô phỏng)
  bool useAhtValues = cfgAht20Enabled && (aht20Connected || (aht20Status == "SIMULATED"));
  bool useMqValues  = cfgMq135Enabled && (mq135Connected || (mq135Status == "SIMULATED"));
  currentEMC = useAhtValues ? calculateHalseyEMC(currentTemperature, currentHumidity) : 0.0f;

  // 5. Đánh giá mức độ rủi ro theo ngưỡng cấu hình đồng bộ từ Web (bỏ qua cảm biến đang tắt/lỗi)
  String evaluatedRisk = "SAFE";
  bool ahtCrit = useAhtValues && (currentHumidity >= cfgHumCrit || currentTemperature >= cfgTempCrit || currentEMC >= cfgEmcCrit);
  bool mqCrit  = useMqValues && (currentGasPPM >= cfgGasCrit);
  bool ahtWarn = useAhtValues && (currentHumidity >= cfgHumWarn || currentTemperature >= cfgTempWarn || currentEMC >= cfgEmcWarn);
  bool mqWarn  = useMqValues && (currentGasPPM >= cfgGasWarn);

  if (ahtCrit || mqCrit) {
    evaluatedRisk = "HIGH_RISK";
  } else if (ahtWarn || mqWarn) {
    evaluatedRisk = "WARNING";
  }

  currentRiskLevel = evaluatedRisk;

  // Cảnh báo Còi (Relay Kênh 2 - IN2)
  if (!cfgBuzzerEnabled) {
    buzzerManualOverride = false;
    setBuzzerRelay(false);
  } else if (cfgBuzzerAuto && currentRiskLevel == "HIGH_RISK") {
    setBuzzerRelay(true);
  } else if (!buzzerManualOverride) {
    setBuzzerRelay(false);
  }

  // Vận hành Quạt (Relay Kênh 1 - IN1)
  if (!cfgFanEnabled) {
    setFanRelay(false);
  } else if (controlMode == "AUTO") {
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

  JsonDocument doc;
  doc["device_id"]   = runtimeDeviceId;
  doc["state"]       = "ONLINE";
  doc["ip_address"]  = WiFi.localIP().toString();
  doc["mac_address"] = runtimeMacAddress;
  doc["chip_id"]     = runtimeChipId;
  doc["rssi"]        = WiFi.RSSI();
  doc["fw_version"]  = FIRMWARE_VERSION;
  doc["hw_version"]  = HARDWARE_VERSION;
  doc["uptime_sec"]  = millis() / 1000;
  doc["timestamp"]   = millis();

  char buffer[512];
  serializeJson(doc, buffer);
  mqttClient.publish(topicStatus.c_str(), buffer, true); // Retain flag
  Serial.printf("📡 [MQTT] Da phat ban tin Heartbeat ONLINE len %s (IP: %s | MAC: %s)\n",
                topicStatus.c_str(), WiFi.localIP().toString().c_str(), runtimeMacAddress.c_str());
}

void sendTelemetry() {
  if (!mqttClient.connected()) return;

  unsigned long nowSec = millis() / 1000;
  String msgId = "msg_esp_" + String(nowSec) + "_" + String(random(100, 999));

  JsonDocument doc;
  doc["msg_id"]      = msgId;
  doc["device_id"]   = runtimeDeviceId;
  doc["mac_address"] = runtimeMacAddress;
  doc["ip_address"]  = WiFi.localIP().toString();
  doc["fw_version"]  = FIRMWARE_VERSION;
  doc["timestamp"]   = millis();

  // Metrics (Nhiệt độ, Độ ẩm không khí, Gas, EMC, Cảm biến từ cửa)
  JsonObject metrics = doc["metrics"].to<JsonObject>();

  JsonObject mTemp = metrics["temperature"].to<JsonObject>();
  mTemp["value"] = currentTemperature;
  mTemp["unit"]  = "C";

  JsonObject mHum = metrics["humidity_air"].to<JsonObject>();
  mHum["value"] = currentHumidity;
  mHum["unit"]  = "%RH";

  JsonObject mGas = metrics["gas_ppm"].to<JsonObject>();
  mGas["value"] = currentGasPPM;
  mGas["unit"]  = "ppm";

  JsonObject mEMC = metrics["estimated_emc"].to<JsonObject>();
  mEMC["value"] = currentEMC;
  mEMC["unit"]  = "%MC";

  JsonObject mDoor = metrics["door_sensor"].to<JsonObject>();
  mDoor["is_open"] = isDoorOpen;
  mDoor["status"]  = isDoorOpen ? "OPEN" : "CLOSED";

  // Actuators & Risk Level
  JsonObject actuators = doc["actuators"].to<JsonObject>();
  actuators["fan_state"]      = fanState ? "ON" : "OFF";
  actuators["buzzer_state"]   = buzzerState ? "ON" : "OFF";
  actuators["door_state"]     = isDoorOpen ? "OPEN" : "CLOSED";
  actuators["control_mode"]   = controlMode;
  actuators["fan_enabled"]    = cfgFanEnabled;
  actuators["buzzer_enabled"] = cfgBuzzerEnabled;
  actuators["buzzer_auto"]    = cfgBuzzerAuto;
  actuators["risk_level"]     = currentRiskLevel;

  // Sensor Health Diagnostics (Chẩn đoán kết nối từng cảm biến)
  bool ahtOk = cfgAht20Enabled && (aht20Connected || (aht20Status == "SIMULATED"));
  bool mqOk  = cfgMq135Enabled && (mq135Connected || (mq135Status == "SIMULATED"));
  int faultCount = ((cfgAht20Enabled && !ahtOk) ? 1 : 0) + ((cfgMq135Enabled && !mqOk) ? 1 : 0);

  JsonObject health = doc["sensor_health"].to<JsonObject>();
  JsonObject hAht = health["aht20"].to<JsonObject>();
  hAht["enabled"] = cfgAht20Enabled;
  hAht["ok"]      = ahtOk;
  hAht["status"]  = aht20Status;
  hAht["pin"]     = "I2C 0x38 (SDA21/SCL22)";
  hAht["message"] = aht20Message;

  JsonObject hMq = health["mq135"].to<JsonObject>();
  hMq["enabled"] = cfgMq135Enabled;
  hMq["ok"]      = mqOk;
  hMq["status"]  = mq135Status;
  hMq["raw_adc"] = lastMq135RawAdc;
  hMq["pin"]     = "GPIO34";
  hMq["message"] = mq135Message;

  JsonObject hDoor = health["door_sensor"].to<JsonObject>();
  hDoor["enabled"]   = cfgDoorEnabled;
  hDoor["ok"]        = cfgDoorEnabled;
  hDoor["status"]    = cfgDoorEnabled ? "DIGITAL_INPUT" : "DISABLED";
  hDoor["raw_logic"] = lastDoorRawLogic;
  hDoor["pin"]       = "GPIO27";
  hDoor["message"]   = cfgDoorEnabled
                         ? "Digital 1-bit GPIO27 (khong tu nhan dien rut day)"
                         : "Da vo hieu hoa theo doi cam bien cua tu Web";

  health["fault_count"] = faultCount;

  doc["rssi"] = WiFi.RSSI();

  char buffer[1280];
  serializeJson(doc, buffer);
  mqttClient.publish(topicTelemetry.c_str(), buffer, false);

  Serial.printf("📊 [Telemetry] T=%.1fC | RH=%.1f%% | EMC=%.1f%% | Gas=%.0f | Door=%s | Fan=%s | Buzzer=%s | Risk=%s\n",
                currentTemperature, currentHumidity, currentEMC, currentGasPPM,
                isDoorOpen ? "OPEN" : "CLOSED",
                fanState ? "ON" : "OFF",
                buzzerState ? "ON" : "OFF",
                currentRiskLevel.c_str());
  Serial.printf("🔧 [Sensors] AHT20=%s | MQ135=%s (ADC=%d) | DoorPin=%d\n",
                aht20Status.c_str(), mq135Status.c_str(), lastMq135RawAdc, lastDoorRawLogic);
}

// =============================================================================
// XỬ LÝ LỆNH ĐIỀU KHIỂN TỪ BACKEND (/cmd) VÀ PHẢN HỒI ACK (/ack)
// =============================================================================
void handleIncomingCommand(char* topic, byte* payload, unsigned int length) {
  char jsonBuffer[1024];
  if (length >= sizeof(jsonBuffer)) length = sizeof(jsonBuffer) - 1;
  memcpy(jsonBuffer, payload, length);
  jsonBuffer[length] = '\0';

  Serial.printf("📥 [MQTT Command] Nhan lenh tu topic %s: %s\n", topic, jsonBuffer);

  JsonDocument cmdDoc;
  DeserializationError error = deserializeJson(cmdDoc, jsonBuffer);
  if (error) {
    Serial.println("❌ [MQTT] Giai ma JSON lenh that bai!");
    return;
  }

  const char* cmdId = cmdDoc["cmd_id"];
  const char* cmdType = cmdDoc["type"];
  JsonObject payloadObj = cmdDoc["payload"];

  String ackStatus = "SUCCESS";
  String ackMessage = "Lenh thuc thi thanh cong";

  if (cmdType && strcmp(cmdType, "ACTUATOR_CONTROL") == 0) {
    const char* action = payloadObj["action"];
    const char* target = payloadObj["target"];
    const char* mode = payloadObj["control_mode"];

    // 1. Điều khiển Quạt thông gió (Relay Kênh 1 - IN1)
    if (!target || strcmp(target, "VENTILATION_FAN") == 0) {
      if (!cfgFanEnabled) {
        setFanRelay(false);
        ackStatus = "FAILED";
        ackMessage = "Quat thong gio (Relay K1) dang bi tat trong cau hinh module";
      } else {
        if (mode) {
          controlMode = String(mode);
          saveConfigToNVS();
        }
        if (action && strcmp(action, "TURN_ON") == 0) {
          setFanRelay(true);
          ackMessage = "Relay K1 GPIO " + String(PIN_RELAY_FAN) + " activated (Quat thong gio BAT)";
        } else if (action && strcmp(action, "TURN_OFF") == 0) {
          setFanRelay(false);
          ackMessage = "Relay K1 GPIO " + String(PIN_RELAY_FAN) + " deactivated (Quat thong gio TAT)";
        }
      }
    }
    // 2. Điều khiển Còi báo động (Relay Kênh 2 - IN2) để test/bật tắt từ Web
    else if (strcmp(target, "ALARM_BUZZER") == 0) {
      if (!cfgBuzzerEnabled) {
        buzzerManualOverride = false;
        setBuzzerRelay(false);
        ackStatus = "FAILED";
        ackMessage = "Coi bao dong (Relay K2) dang bi tat trong cau hinh module";
      } else if (action && strcmp(action, "TURN_ON") == 0) {
        buzzerManualOverride = true;
        setBuzzerRelay(true);
        ackMessage = "Relay K2 GPIO " + String(PIN_RELAY_BUZZER) + " activated (Coi bao dong BAT)";
      } else if (action && strcmp(action, "TURN_OFF") == 0) {
        buzzerManualOverride = false;
        setBuzzerRelay(false);
        ackMessage = "Relay K2 GPIO " + String(PIN_RELAY_BUZZER) + " deactivated (Coi bao dong TAT)";
      }
    }
  } else if (cmdType && strcmp(cmdType, "UPDATE_CONFIG") == 0) {
    if (!payloadObj["sampling_interval_ms"].isNull()) {
      unsigned long interval = payloadObj["sampling_interval_ms"].as<unsigned long>();
      if (interval >= 1000) samplingIntervalMs = interval;
    }
    if (!payloadObj["temp_warn_threshold"].isNull()) cfgTempWarn = payloadObj["temp_warn_threshold"].as<float>();
    if (!payloadObj["temp_crit_threshold"].isNull()) cfgTempCrit = payloadObj["temp_crit_threshold"].as<float>();
    if (!payloadObj["hum_warn_threshold"].isNull())  cfgHumWarn  = payloadObj["hum_warn_threshold"].as<float>();
    if (!payloadObj["hum_crit_threshold"].isNull())  cfgHumCrit  = payloadObj["hum_crit_threshold"].as<float>();
    if (!payloadObj["gas_warn_threshold"].isNull())  cfgGasWarn  = payloadObj["gas_warn_threshold"].as<float>();
    if (!payloadObj["gas_crit_threshold"].isNull())  cfgGasCrit  = payloadObj["gas_crit_threshold"].as<float>();
    if (!payloadObj["emc_warn_threshold"].isNull())  cfgEmcWarn  = payloadObj["emc_warn_threshold"].as<float>();
    if (!payloadObj["emc_crit_threshold"].isNull())  cfgEmcCrit  = payloadObj["emc_crit_threshold"].as<float>();

    JsonObject periphObj = payloadObj["peripherals"];
    if (!periphObj.isNull()) {
      if (!periphObj["aht20_enabled"].isNull())  cfgAht20Enabled  = periphObj["aht20_enabled"].as<bool>();
      if (!periphObj["mq135_enabled"].isNull())  cfgMq135Enabled  = periphObj["mq135_enabled"].as<bool>();
      if (!periphObj["door_enabled"].isNull())   cfgDoorEnabled   = periphObj["door_enabled"].as<bool>();
      if (!periphObj["fan_enabled"].isNull())    cfgFanEnabled    = periphObj["fan_enabled"].as<bool>();
      if (!periphObj["buzzer_enabled"].isNull()) cfgBuzzerEnabled = periphObj["buzzer_enabled"].as<bool>();
      if (!periphObj["buzzer_auto"].isNull())    cfgBuzzerAuto    = periphObj["buzzer_auto"].as<bool>();
      if (!periphObj["fan_auto"].isNull()) {
        controlMode = periphObj["fan_auto"].as<bool>() ? "AUTO" : "MANUAL";
      }
      if (!cfgFanEnabled) setFanRelay(false);
      if (!cfgBuzzerEnabled) {
        buzzerManualOverride = false;
        setBuzzerRelay(false);
      }
    }

    saveConfigToNVS();
    readSensors();
    sendTelemetry();
    ackMessage = "Da cap nhat & luu NVS cau hinh module/nguong thanh cong";
  }

  // Tự động phản hồi bản tin xác nhận /ack sau 300ms
  delay(300);

  JsonDocument ackDoc;
  ackDoc["cmd_id"]      = cmdId ? cmdId : "cmd_unknown";
  ackDoc["device_id"]   = runtimeDeviceId;
  ackDoc["status"]      = ackStatus;
  ackDoc["executed_at"] = millis();

  JsonObject currentActs = ackDoc["current_actuators"].to<JsonObject>();
  currentActs["fan_state"]    = fanState ? "ON" : "OFF";
  currentActs["buzzer_state"] = buzzerState ? "ON" : "OFF";
  currentActs["door_state"]   = isDoorOpen ? "OPEN" : "CLOSED";
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
  String lwtPayload = "{\"device_id\":\"" + runtimeDeviceId + "\",\"state\":\"OFFLINE\"}";

  bool success = false;
  if (strlen(MQTT_USERNAME) > 0) {
    success = mqttClient.connect(runtimeDeviceId.c_str(), MQTT_USERNAME, MQTT_PASSWORD,
                                 topicStatus.c_str(), 1, true, lwtPayload.c_str());
  } else {
    success = mqttClient.connect(runtimeDeviceId.c_str(), topicStatus.c_str(), 1, true, lwtPayload.c_str());
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
  initDeviceIdentity();
  loadConfigFromNVS();

  Serial.println("\n========================================================");
  Serial.printf("🌾 SMART GRAIN STORAGE IOT NODE - %s (TCVN 8370)\n", runtimeDeviceId.c_str());
  Serial.printf("Firmware v%s | Hardware: %s\n", FIRMWARE_VERSION, HARDWARE_VERSION);
  Serial.printf("🆔 NODE IDENTITY | Device ID : %s (USE_MAC=%s)\n",
                runtimeDeviceId.c_str(), USE_MAC_AS_DEVICE_ID ? "true" : "false");
  Serial.printf("🆔 NODE IDENTITY | MAC Addr  : %s | Chip ID: %s\n",
                runtimeMacAddress.c_str(), runtimeChipId.c_str());
  Serial.printf("📡 MQTT Topics   | %s | %s\n",
                topicStatus.c_str(), topicTelemetry.c_str());
  Serial.println("========================================================");

  // 1. Cấu hình chân Relay 2 kênh và Cảm biến từ cửa
  pinMode(PIN_RELAY_FAN, OUTPUT);
  pinMode(PIN_RELAY_BUZZER, OUTPUT);
  pinMode(PIN_DOOR_SENSOR, DOOR_PIN_MODE);

  // Trạng thái ban đầu: Tắt Quạt, Tắt Còi
  setFanRelay(false);
  setBuzzerRelay(false);

  // 2. Khởi tạo Bus I2C (SDA=21, SCL=22)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);

  // 3. Khởi tạo Cảm biến AHT20 (Địa chỉ mặc định 0x38, nguồn 3.3V)
  if (isI2CDevicePresent(AHT20_I2C_ADDR) && aht.begin(&Wire, 0, AHT20_I2C_ADDR)) {
    hasRealAHT = true;
    aht20Connected = true;
    aht20Status = "OK";
    aht20Message = "Ket noi I2C 0x38 on dinh";
    Serial.println("✅ [Hardware] Cam bien nhiet am AHT20 san sang (I2C 0x38)!");
  } else {
    hasRealAHT = false;
    aht20Connected = false;
    aht20Status = ENABLE_SENSOR_SIMULATION_FALLBACK ? "SIMULATED" : "DISCONNECTED";
    aht20Message = "Khong tim thay AHT20 tai I2C 0x38 (kiem tra SDA=21, SCL=22, 3.3V)";
    Serial.println("⚠️ [Hardware] Khong tim thay AHT20 tai I2C 0x38! Kiem tra day SDA(21), SCL(22), 3.3V.");
  }

  // 4. Cấu hình MQTT Client (tăng buffer 1280 byte để chứa đủ sensor_health)
  mqttClient.setServer(MQTT_SERVER_IP, MQTT_SERVER_PORT);
  mqttClient.setCallback(handleIncomingCommand);
  mqttClient.setBufferSize(1280);

  // 5. Kết nối Wi-Fi & MQTT
  connectWiFi();
  connectMQTT();
}

// =============================================================================
// VÒNG LẶP CHÍNH (NON-BLOCKING MAIN LOOP)
// =============================================================================
void loop() {
  unsigned long currentMillis = millis();

  // A. Tự động kết nối lại Wi-Fi và MQTT mỗi 5 giây nếu mất mạng
  if (currentMillis - lastMqttRetryTime >= 5000) {
    lastMqttRetryTime = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    } else if (!mqttClient.connected()) {
      connectMQTT();
    }
  }

  // B. Giữ nhịp MQTT Client loop lắng nghe lệnh từ Broker
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  // C. Đọc cảm biến định kỳ và gửi Telemetry (Mặc định mỗi 3000ms)
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
