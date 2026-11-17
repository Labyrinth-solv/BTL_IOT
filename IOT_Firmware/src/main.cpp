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
// Durable output interlock, independent of the editable peripheral configuration.
bool nodeOutputsInhibited = false;
String registrationId = "";

// Cấu hình bật/tắt từng module & ngưỡng động (đồng bộ từ Web, lưu vào NVS Flash)
bool cfgAht20Enabled  = true;
bool cfgMq135Enabled  = false;
bool cfgDoorEnabled   = true;
bool cfgFanEnabled    = true;
bool cfgBuzzerEnabled = true;
bool cfgBuzzerAuto    = true;

uint8_t cfgPinSda    = PIN_I2C_SDA;
uint8_t cfgPinScl    = PIN_I2C_SCL;
uint8_t cfgPinMq135  = PIN_MQ135_ANALOG;
uint8_t cfgPinDoor   = PIN_DOOR_SENSOR;
uint8_t cfgPinFan    = PIN_RELAY_FAN;
uint8_t cfgPinBuzzer = PIN_RELAY_BUZZER;

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
bool buzzerManualOverride = false;// Cho phép bật còi thủ công để test từ Web
bool buzzerSilencedByUser = false;// Cho phép tắt còi thủ công khi đang HIGH_RISK cho tới khi hết ngưỡng nguy hiểm
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

// Ngoại vi tùy chọn thêm từ Web (tối đa 8 thiết bị, lưu trong NVS Flash)
#define MAX_CUSTOM_PERIPHERALS 8
struct CustomPeripheral {
  String id;
  String name;
  String type;       // "RELAY_OUTPUT", "DIGITAL_INPUT", "ANALOG_INPUT"
  uint8_t gpio;
  bool activeHigh;
  bool pullUp;
  bool outputState;
  int rawValue;
  int displayValue;  // 0/1 cho RELAY_OUTPUT/DIGITAL_INPUT, 0..100% cho ANALOG_INPUT
};
CustomPeripheral customPeripherals[MAX_CUSTOM_PERIPHERALS];
int customPeripheralCount = 0;
constexpr size_t MQTT_BUFFER_BYTES = 8192;
String recentCommandIds[8];
String recentCommandAcks[8];
uint8_t nextCommandCache = 0;
uint32_t bootNonce = 0;
uint32_t messageSequence = 0;

bool isSafeCustomGpio(uint8_t gpio, const String& type) {
  const uint8_t allowed[] = {4, 5, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39};
  bool found = false;
  for (size_t i = 0; i < sizeof(allowed); i++) {
    if (allowed[i] == gpio) {
      found = true;
      break;
    }
  }
  if (!found) return false;
  if (type != "RELAY_OUTPUT" && type != "DIGITAL_INPUT" && type != "ANALOG_INPUT") return false;
  if (type == "ANALOG_INPUT" && !(gpio == 32 || gpio == 33 || gpio == 34 || gpio == 35 || gpio == 36 || gpio == 39)) return false;
  if (type == "RELAY_OUTPUT" && gpio >= 34) return false; // GPIO 34-39 la chan Input-only
  return true;
}

bool isSafeBuiltinGpio(uint8_t gpio, bool allowInputOnly, bool allowI2C) {
  if (allowI2C && (gpio == 21 || gpio == 22)) return true;
  if (allowInputOnly) return isSafeCustomGpio(gpio, "DIGITAL_INPUT");
  return isSafeCustomGpio(gpio, "RELAY_OUTPUT");
}

void writeCustomRelayPin(const CustomPeripheral& cp) {
  bool enabled = cp.outputState && !nodeOutputsInhibited;
  bool level = cp.activeHigh ? enabled : !enabled;
  digitalWrite(cp.gpio, level ? HIGH : LOW);
}

void applyCustomPeripheralsHardware() {
  for (int i = 0; i < customPeripheralCount; i++) {
    CustomPeripheral& cp = customPeripherals[i];
    if (!isSafeCustomGpio(cp.gpio, cp.type)) continue;
    if (cp.type == "RELAY_OUTPUT") {
      pinMode(cp.gpio, OUTPUT);
      writeCustomRelayPin(cp);
      cp.rawValue = cp.outputState ? 1 : 0;
      cp.displayValue = cp.outputState ? 1 : 0;
    } else if (cp.type == "DIGITAL_INPUT") {
      pinMode(cp.gpio, cp.pullUp && cp.gpio < 34 ? INPUT_PULLUP : INPUT);
    } else if (cp.type == "ANALOG_INPUT") {
      pinMode(cp.gpio, INPUT);
    }
  }
}

void parseCustomPeripheralsArray(JsonArray arr, bool preserveOutputStates) {
  bool prevStates[MAX_CUSTOM_PERIPHERALS];
  String prevIds[MAX_CUSTOM_PERIPHERALS];
  uint8_t prevPins[MAX_CUSTOM_PERIPHERALS];
  bool prevActiveHigh[MAX_CUSTOM_PERIPHERALS];
  String prevTypes[MAX_CUSTOM_PERIPHERALS];
  int prevCount = customPeripheralCount;
  for (int i = 0; i < prevCount; i++) {
    prevIds[i] = customPeripherals[i].id;
    prevStates[i] = customPeripherals[i].outputState;
    prevPins[i] = customPeripherals[i].gpio;
    prevActiveHigh[i] = customPeripherals[i].activeHigh;
    prevTypes[i] = customPeripherals[i].type;
    bool keepPin = false;
    for (JsonObject next : arr) {
      if (String(next["id"] | "") == prevIds[i] && (next["gpio"] | -1) == prevPins[i] &&
          String(next["type"] | "") == prevTypes[i] && (next["active_high"] | true) == prevActiveHigh[i]) keepPin = true;
    }
    if (!keepPin) {
      if (prevTypes[i] == "RELAY_OUTPUT") digitalWrite(prevPins[i], prevActiveHigh[i] ? LOW : HIGH);
      pinMode(prevPins[i], INPUT);
    }
  }

  int nextCount = 0;
  for (JsonObject obj : arr) {
    if (nextCount >= MAX_CUSTOM_PERIPHERALS) break;
    String id = obj["id"] | "";
    String name = obj["name"] | "";
    String type = obj["type"] | "";
    int gpioInt = obj["gpio"] | -1;
    if (id.length() == 0 || gpioInt < 0 || !isSafeCustomGpio((uint8_t)gpioInt, type)) continue;

    CustomPeripheral cp;
    cp.id = id;
    cp.name = name;
    cp.type = type;
    cp.gpio = (uint8_t)gpioInt;
    cp.activeHigh = obj["active_high"].isNull() ? true : obj["active_high"].as<bool>();
    cp.pullUp = obj["pull_up"].isNull() ? true : obj["pull_up"].as<bool>();
    cp.outputState = false;
    cp.rawValue = 0;
    cp.displayValue = 0;

    if (preserveOutputStates) {
      for (int j = 0; j < prevCount; j++) {
        if (prevIds[j] == cp.id && prevPins[j] == cp.gpio && prevTypes[j] == cp.type && prevActiveHigh[j] == cp.activeHigh) {
          cp.outputState = prevStates[j];
          break;
        }
      }
    }
    customPeripherals[nextCount++] = cp;
  }
  customPeripheralCount = nextCount;
}

String serializeCustomPeripheralsConfig() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < customPeripheralCount; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["id"] = customPeripherals[i].id;
    o["name"] = customPeripherals[i].name;
    o["type"] = customPeripherals[i].type;
    o["gpio"] = customPeripherals[i].gpio;
    o["active_high"] = customPeripherals[i].activeHigh;
    o["pull_up"] = customPeripherals[i].pullUp;
  }
  String out;
  serializeJson(arr, out);
  return out;
}

bool validateConfig(JsonObject payload, String& error) {
  if (!payload["sampling_interval_ms"].isNull()) {
    double interval = payload["sampling_interval_ms"].as<double>();
    if (!isfinite(interval) || interval < 1000 || interval > 3600000 || floor(interval) != interval) {
      error = "Invalid sampling interval"; return false;
    }
  }
  const char* warnKeys[] = {"temp_warn_threshold", "hum_warn_threshold", "gas_warn_threshold", "emc_warn_threshold"};
  const char* critKeys[] = {"temp_crit_threshold", "hum_crit_threshold", "gas_crit_threshold", "emc_crit_threshold"};
  float warns[] = {cfgTempWarn, cfgHumWarn, cfgGasWarn, cfgEmcWarn};
  float crits[] = {cfgTempCrit, cfgHumCrit, cfgGasCrit, cfgEmcCrit};
  float mins[] = {-40, 0, 0, 0};
  float maxs[] = {85, 100, 10000, 100};
  for (int i = 0; i < 4; i++) {
    float warn = payload[warnKeys[i]] | warns[i];
    float crit = payload[critKeys[i]] | crits[i];
    if (!isfinite(warn) || !isfinite(crit) || warn < mins[i] || crit > maxs[i] || warn >= crit) {
      error = "Invalid warning/critical thresholds"; return false;
    }
  }
  JsonObject p = payload["peripherals"];
  const char* enableKeys[] = {"aht20_enabled", "aht20_enabled", "mq135_enabled", "door_enabled", "fan_enabled", "buzzer_enabled"};
  const char* pinKeys[] = {"aht20_sda_gpio", "aht20_scl_gpio", "mq135_gpio", "door_gpio", "fan_gpio", "buzzer_gpio"};
  bool enabled[] = {cfgAht20Enabled, cfgAht20Enabled, cfgMq135Enabled, cfgDoorEnabled, cfgFanEnabled, cfgBuzzerEnabled};
  int pins[] = {cfgPinSda, cfgPinScl, cfgPinMq135, cfgPinDoor, cfgPinFan, cfgPinBuzzer};
  bool used[40] = {};
  for (int i = 0; i < 6; i++) {
    if (!(p[enableKeys[i]] | enabled[i])) continue;
    int pin = p[pinKeys[i]] | pins[i];
    bool safe = pin >= 0 && pin < 40 &&
      (i < 2 ? isSafeBuiltinGpio(pin, false, true) :
       i == 2 ? isSafeCustomGpio(pin, "ANALOG_INPUT") : isSafeBuiltinGpio(pin, false, false));
    if (!safe || used[pin]) { error = "Invalid or duplicate builtin GPIO"; return false; }
    used[pin] = true;
  }
  if (payload["custom_peripherals"].isNull()) {
    for (int i = 0; i < customPeripheralCount; i++) {
      int pin = customPeripherals[i].gpio;
      if (used[pin]) { error = "GPIO already owned by custom peripheral"; return false; }
      used[pin] = true;
    }
    return true;
  }
  if (!payload["custom_peripherals"].is<JsonArray>()) { error = "Invalid peripheral array"; return false; }
  JsonArray arr = payload["custom_peripherals"];
  if (arr.size() > MAX_CUSTOM_PERIPHERALS) { error = "Too many peripherals"; return false; }
  for (size_t i = 0; i < arr.size(); i++) {
    JsonObject cp = arr[i];
    int pin = cp["gpio"] | -1;
    String type = cp["type"] | "";
    String id = cp["id"] | "";
    if (id.isEmpty() || pin < 0 || pin >= 40 || !isSafeCustomGpio(pin, type) || used[pin] ||
        (type == "DIGITAL_INPUT" && pin >= 34 && (cp["pull_up"] | true))) {
      error = "Invalid or duplicate custom GPIO"; return false;
    }
    for (size_t j = 0; j < i; j++) {
      if (String(arr[j]["id"] | "") == id) { error = "Duplicate peripheral ID"; return false; }
    }
    used[pin] = true;
  }
  return true;
}

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

void loadNodeLifecycle() {
  Preferences life;
  if (!life.begin("grain_life", true)) return; // First boot: namespace does not exist yet.
  String state = life.getString("state", "");
  life.end();
  if (!state.length()) return;
  JsonDocument doc;
  if (deserializeJson(doc, state) || !doc["outputs_inhibited"].is<bool>() || !doc["registration_id"].is<String>()) {
    nodeOutputsInhibited = true; // Corrupted lifecycle must not start outputs.
    return;
  }
  registrationId = doc["registration_id"].as<String>();
  nodeOutputsInhibited = doc["outputs_inhibited"].as<bool>();
}

bool saveNodeLifecycle(const String& nextRegistration, bool inhibited) {
  Preferences life;
  if (!life.begin("grain_life", false)) return false;
  JsonDocument doc;
  doc["registration_id"] = nextRegistration;
  doc["outputs_inhibited"] = inhibited;
  String state;
  serializeJson(doc, state);
  bool saved = life.putString("state", state) > 0;
  life.end();
  return saved;
}

void loadConfigFromNVS() {
  if (!preferences.begin("grain_cfg", true)) return;
  samplingIntervalMs = preferences.getULong("interval", DEFAULT_SAMPLING_INTERVAL_MS);
  if (samplingIntervalMs < 1000) samplingIntervalMs = DEFAULT_SAMPLING_INTERVAL_MS;

  cfgAht20Enabled  = preferences.getBool("en_aht", true);
  cfgMq135Enabled  = preferences.getBool("en_mq", false);
  cfgDoorEnabled   = preferences.getBool("en_door", true);
  cfgFanEnabled    = preferences.getBool("en_fan", true);
  cfgBuzzerEnabled = preferences.getBool("en_buz", true);
  cfgBuzzerAuto    = preferences.getBool("auto_buz", true);
  controlMode      = preferences.getBool("auto_fan", true) ? "AUTO" : "MANUAL";

  uint8_t nSda = preferences.getUChar("pin_sda", PIN_I2C_SDA);
  uint8_t nScl = preferences.getUChar("pin_scl", PIN_I2C_SCL);
  uint8_t nMq  = preferences.getUChar("pin_mq", PIN_MQ135_ANALOG);
  uint8_t nDr  = preferences.getUChar("pin_door", PIN_DOOR_SENSOR);
  uint8_t nFan = preferences.getUChar("pin_fan", PIN_RELAY_FAN);
  uint8_t nBuz = preferences.getUChar("pin_buz", PIN_RELAY_BUZZER);
  cfgPinSda    = isSafeBuiltinGpio(nSda, false, true) ? nSda : PIN_I2C_SDA;
  cfgPinScl    = isSafeBuiltinGpio(nScl, false, true) ? nScl : PIN_I2C_SCL;
  cfgPinMq135  = isSafeBuiltinGpio(nMq, true, false) ? nMq : PIN_MQ135_ANALOG;
  cfgPinDoor   = isSafeBuiltinGpio(nDr, true, false) ? nDr : PIN_DOOR_SENSOR;
  cfgPinFan    = isSafeBuiltinGpio(nFan, false, false) ? nFan : PIN_RELAY_FAN;
  cfgPinBuzzer = isSafeBuiltinGpio(nBuz, false, false) ? nBuz : PIN_RELAY_BUZZER;

  cfgTempWarn = preferences.getFloat("t_warn", THRESHOLD_TEMP_WARN);
  cfgTempCrit = preferences.getFloat("t_crit", THRESHOLD_TEMP_CRIT);
  cfgHumWarn  = preferences.getFloat("h_warn", THRESHOLD_HUM_WARN);
  cfgHumCrit  = preferences.getFloat("h_crit", THRESHOLD_HUM_CRIT);
  cfgGasWarn  = preferences.getFloat("g_warn", THRESHOLD_GAS_WARN);
  cfgGasCrit  = preferences.getFloat("g_crit", THRESHOLD_GAS_CRIT);
  cfgEmcWarn  = preferences.getFloat("e_warn", THRESHOLD_EMC_WARN);
  cfgEmcCrit  = preferences.getFloat("e_crit", THRESHOLD_EMC_CRIT);
  String customJson = preferences.getString("custom_per", "[]");
  preferences.end();

  if (customJson.length() > 2) {
    JsonDocument cDoc;
    if (!deserializeJson(cDoc, customJson) && cDoc.is<JsonArray>()) {
      parseCustomPeripheralsArray(cDoc.as<JsonArray>(), false);
    }
  }

  Serial.printf("💾 [NVS] Da nap cau hinh: interval=%lums | AHT=%d MQ=%d DOOR=%d FAN=%d(mode=%s) BUZ=%d(auto=%d) | Custom=%d\n",
                samplingIntervalMs, cfgAht20Enabled, cfgMq135Enabled, cfgDoorEnabled,
                cfgFanEnabled, controlMode.c_str(), cfgBuzzerEnabled, cfgBuzzerAuto, customPeripheralCount);
}

bool saveConfigToNVS() {
  if (!preferences.begin("grain_cfg", false)) return false;
  bool saved = true;
  saved = (preferences.putULong("interval", samplingIntervalMs) > 0) && saved;
  saved = (preferences.putBool("en_aht", cfgAht20Enabled) > 0) && saved;
  saved = (preferences.putBool("en_mq", cfgMq135Enabled) > 0) && saved;
  saved = (preferences.putBool("en_door", cfgDoorEnabled) > 0) && saved;
  saved = (preferences.putBool("en_fan", cfgFanEnabled) > 0) && saved;
  saved = (preferences.putBool("en_buz", cfgBuzzerEnabled) > 0) && saved;
  saved = (preferences.putBool("auto_buz", cfgBuzzerAuto) > 0) && saved;
  saved = (preferences.putBool("auto_fan", controlMode == "AUTO") > 0) && saved;
  saved = (preferences.putUChar("pin_sda", cfgPinSda) > 0) && saved;
  saved = (preferences.putUChar("pin_scl", cfgPinScl) > 0) && saved;
  saved = (preferences.putUChar("pin_mq", cfgPinMq135) > 0) && saved;
  saved = (preferences.putUChar("pin_door", cfgPinDoor) > 0) && saved;
  saved = (preferences.putUChar("pin_fan", cfgPinFan) > 0) && saved;
  saved = (preferences.putUChar("pin_buz", cfgPinBuzzer) > 0) && saved;

  saved = (preferences.putFloat("t_warn", cfgTempWarn) > 0) && saved;
  saved = (preferences.putFloat("t_crit", cfgTempCrit) > 0) && saved;
  saved = (preferences.putFloat("h_warn", cfgHumWarn) > 0) && saved;
  saved = (preferences.putFloat("h_crit", cfgHumCrit) > 0) && saved;
  saved = (preferences.putFloat("g_warn", cfgGasWarn) > 0) && saved;
  saved = (preferences.putFloat("g_crit", cfgGasCrit) > 0) && saved;
  saved = (preferences.putFloat("e_warn", cfgEmcWarn) > 0) && saved;
  saved = (preferences.putFloat("e_crit", cfgEmcCrit) > 0) && saved;
  saved = (preferences.putString("custom_per", serializeCustomPeripheralsConfig()) > 0) && saved;
  preferences.end();
  return saved;
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
  fanState = cfgFanEnabled && enable && !nodeOutputsInhibited;
  if (cfgFanEnabled) setRelayPin(cfgPinFan, fanState);
}

void setBuzzerRelay(bool enable) {
  buzzerState = cfgBuzzerEnabled && enable && !nodeOutputsInhibited;
  if (cfgBuzzerEnabled) setRelayPin(cfgPinBuzzer, buzzerState);
}

void inhibitAllOutputs() {
  nodeOutputsInhibited = true;
  buzzerManualOverride = false;
  buzzerSilencedByUser = false;
  setFanRelay(false);
  setBuzzerRelay(false);
  for (int i = 0; i < customPeripheralCount; i++) {
    CustomPeripheral& cp = customPeripherals[i];
    if (cp.type != "RELAY_OUTPUT") continue;
    cp.outputState = false;
    cp.rawValue = cp.displayValue = 0;
    writeCustomRelayPin(cp); // Keep the output driven at its inactive level.
  }
}

// =============================================================================
// ĐỌC CẢM BIẾN & KIỂM TRA SỨC KHỎE PHẦN CỨNG (AHT20, MQ-135, CỬA)
// =============================================================================
String lastAhtDiagnosticMsg = "";

uint8_t probeI2CAddress(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission();
}

String scanI2CBusSummary() {
  String found = "";
  int count = 0;
  for (uint8_t addr = 0x01; addr < 0x7F; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      if (count > 0) found += ", ";
      char hexBuf[6];
      snprintf(hexBuf, sizeof(hexBuf), "0x%02X", addr);
      found += String(hexBuf);
      count++;
      if (count >= 6) {
        found += "...";
        break;
      }
    }
  }
  return found;
}

String diagnoseAht20I2CBus(uint8_t probeErr) {
  // Tam dung I2C de kiem tra muc logic tinh tren chan vat ly SDA & SCL
  Wire.end();

  pinMode(cfgPinSda, INPUT);
  pinMode(cfgPinScl, INPUT);
  delayMicroseconds(50);
  int sdaNoPull = digitalRead(cfgPinSda);
  int sclNoPull = digitalRead(cfgPinScl);

  pinMode(cfgPinSda, INPUT_PULLUP);
  pinMode(cfgPinScl, INPUT_PULLUP);
  delayMicroseconds(50);
  int sdaPull = digitalRead(cfgPinSda);
  int sclPull = digitalRead(cfgPinScl);

  // Khoi phuc lai I2C o 100kHz va timeout 50ms
  Wire.begin(cfgPinSda, cfgPinScl);
  Wire.setClock(100000);
  Wire.setTimeOut(50);

  // 1. Duong day bi keo cung xuong GND (ke ca khi bat PULLUP noi bo)
  if (sdaPull == LOW || sclPull == LOW) {
    char msg[180];
    snprintf(msg, sizeof(msg),
             "Ket bus I2C muc LOW (SDA=%d, SCL=%d, err=%u) - Kiem tra cham GND, mat nguon VIN hoac cam nguoc day",
             sdaPull, sclPull, probeErr);
    return String(msg);
  }

  // 2. Thả nổi (khong co tro pull-up ngoai / ho mach / long day SDA hoac SCL)
  if (sdaNoPull == LOW || sclNoPull == LOW) {
    char msg[180];
    snprintf(msg, sizeof(msg),
             "Ho day / thieu pull-up I2C (noPU SDA=%d,SCL=%d, err=%u) - Kiem tra moi han & day SDA21/SCL22",
             sdaNoPull, sclNoPull, probeErr);
    return String(msg);
  }

  // 3. Ca SDA va SCL deu HIGH -> Quet toan bo dia chi I2C 0x01..0x7E
  String otherDevices = scanI2CBusSummary();
  if (otherDevices.length() > 0) {
    char msg[180];
    snprintf(msg, sizeof(msg),
             "Khong thay 0x38 (err=%u), quet thay I2C tai: %s - Kiem tra dung loai cam bien/dia chi",
             probeErr, otherDevices.c_str());
    return String(msg);
  }

  if (probeErr == 2) {
    return "NACK tai 0x38 (SDA21=1, SCL22=1) - Co the nguoc SDA/SCL, mat nguon AHT20 hoac long day";
  }
  if (probeErr == 5) {
    return "I2C Timeout tai 0x38 (err=5) - Kiem tra nguoc day SDA/SCL hoac nhieu bus";
  }

  char msg[160];
  snprintf(msg, sizeof(msg),
           "Khong thay AHT20 tai 0x38 (err=%u, SDA21=%d, SCL22=%d) - Kiem tra day & nguon 3.3V",
           probeErr, sdaPull, sclPull);
  return String(msg);
}

void readSensors() {
  // 1. Kiểm tra & đọc Cảm biến Nhiệt độ & Độ ẩm AHT20 (I2C 0x38, nguồn 3.3V)
  if (!cfgAht20Enabled) {
    hasRealAHT = false;
    aht20Connected = false;
    aht20Status = "DISABLED";
    aht20Message = "Da vo hieu hoa theo doi AHT20 tu Web";
    lastAhtDiagnosticMsg = aht20Message;
    currentTemperature = 0.0f;
    currentHumidity = 0.0f;
  } else {
    uint8_t probeErr = probeI2CAddress(AHT20_I2C_ADDR);
    if (probeErr != 0) {
      if (hasRealAHT) {
        Serial.println("❌ [Hardware] Mat ket noi cam bien AHT20 tren bus I2C (0x38)!");
      }
      hasRealAHT = false;
      aht20Connected = false;
      aht20Status = ENABLE_SENSOR_SIMULATION_FALLBACK ? "SIMULATED" : "DISCONNECTED";
      aht20Message = diagnoseAht20I2CBus(probeErr);
      if (aht20Message != lastAhtDiagnosticMsg) {
        Serial.printf("🔎 [AHT20 Diag] %s\n", aht20Message.c_str());
        lastAhtDiagnosticMsg = aht20Message;
      }
    } else {
      if (!hasRealAHT) {
        if (aht.begin(&Wire, 0, AHT20_I2C_ADDR)) {
          hasRealAHT = true;
          Serial.println("🔄 [Hardware] Da nhan dien va ket noi cam bien AHT20 (I2C 0x38)!");
        } else {
          aht20Connected = false;
          aht20Status = "READ_ERROR";
          uint8_t st = aht.getStatus();
          char errBuf[140];
          snprintf(errBuf, sizeof(errBuf),
                   "Thay dia chi 0x38 nhung khoi tao AHT20 that bai (status=0x%02X)", st);
          aht20Message = String(errBuf);
          if (aht20Message != lastAhtDiagnosticMsg) {
            Serial.printf("🔎 [AHT20 Diag] %s\n", aht20Message.c_str());
            lastAhtDiagnosticMsg = aht20Message;
          }
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
          lastAhtDiagnosticMsg = aht20Message;
        } else {
          aht20Connected = false;
          hasRealAHT = false;
          aht20Status = "READ_ERROR";
          uint8_t st = aht.getStatus();
          char errBuf[150];
          snprintf(errBuf, sizeof(errBuf),
                   "Loi doc du lieu AHT20 (ok=%d, st=0x%02X, T=%.1f, H=%.1f)",
                   readOk ? 1 : 0, st, isnan(t) ? -999.0f : t, isnan(h) ? -999.0f : h);
          aht20Message = String(errBuf);
          if (aht20Message != lastAhtDiagnosticMsg) {
            Serial.printf("🔎 [AHT20 Diag] %s\n", aht20Message.c_str());
            lastAhtDiagnosticMsg = aht20Message;
          }
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
      adcSum += analogRead(cfgPinMq135);
      delayMicroseconds(200);
    }
    int rawADC = (int)(adcSum / 8);
    lastMq135RawAdc = rawADC;

    if (rawADC >= MQ135_ADC_MIN_VALID && rawADC <= MQ135_ADC_MAX_VALID) {
      mq135Connected = true;
      mq135Status = "OK";
      mq135Message = "Tin hieu ADC on dinh tren GPIO " + String(cfgPinMq135);
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

  // 3. Đọc Cảm biến từ cửa kho (Digital D0)
  if (!cfgDoorEnabled) {
    lastDoorRawLogic = LOW;
    isDoorOpen = false;
  } else {
    lastDoorRawLogic = digitalRead(cfgPinDoor);
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
    buzzerSilencedByUser = false;
    setBuzzerRelay(false);
  } else if (buzzerManualOverride) {
    setBuzzerRelay(true);
  } else if (cfgBuzzerAuto && currentRiskLevel == "HIGH_RISK" && !buzzerSilencedByUser) {
    setBuzzerRelay(true);
  } else {
    if (currentRiskLevel != "HIGH_RISK") {
      buzzerSilencedByUser = false;
    }
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

  // 6. Đọc / cập nhật các ngoại vi tùy chọn (Custom Peripherals)
  for (int i = 0; i < customPeripheralCount; i++) {
    CustomPeripheral& cp = customPeripherals[i];
    if (!isSafeCustomGpio(cp.gpio, cp.type)) continue;
    if (cp.type == "RELAY_OUTPUT") {
      cp.rawValue = cp.outputState ? 1 : 0;
      cp.displayValue = cp.outputState ? 1 : 0;
    } else if (cp.type == "DIGITAL_INPUT") {
      int logic = digitalRead(cp.gpio);
      cp.rawValue = logic;
      cp.displayValue = (cp.activeHigh ? (logic == HIGH) : (logic == LOW)) ? 1 : 0;
    } else if (cp.type == "ANALOG_INPUT") {
      long sum = 0;
      for (int s = 0; s < 4; s++) {
        sum += analogRead(cp.gpio);
        delayMicroseconds(150);
      }
      int raw = (int)(sum / 4);
      cp.rawValue = raw;
      cp.displayValue = constrain((int)map(raw, 0, 4095, 0, 100), 0, 100);
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
  doc["registration_id"] = registrationId;
  doc["outputs_inhibited"] = nodeOutputsInhibited;
  doc["ip_address"]  = WiFi.localIP().toString();
  doc["mac_address"] = runtimeMacAddress;
  doc["chip_id"]     = runtimeChipId;
  doc["rssi"]        = WiFi.RSSI();
  doc["fw_version"]  = FIRMWARE_VERSION;
  doc["hw_version"]  = HARDWARE_VERSION;
  doc["uptime_sec"]  = millis() / 1000;
  doc["timestamp"]   = millis();

  String buffer;
  serializeJson(doc, buffer);
  mqttClient.publish(topicStatus.c_str(), buffer.c_str(), true); // Retain flag
  Serial.printf("📡 [MQTT] Da phat ban tin Heartbeat ONLINE len %s (IP: %s | MAC: %s)\n",
                topicStatus.c_str(), WiFi.localIP().toString().c_str(), runtimeMacAddress.c_str());
}

void sendTelemetry() {
  if (!mqttClient.connected()) return;

  String msgId = runtimeDeviceId + "_" + String(bootNonce, HEX) + "_" + String(++messageSequence);

  JsonDocument doc;
  doc["msg_id"]      = msgId;
  doc["registration_id"] = registrationId;
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
  actuators["outputs_inhibited"] = nodeOutputsInhibited;
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
  hAht["pin"]     = "I2C 0x38 (SDA" + String(cfgPinSda) + "/SCL" + String(cfgPinScl) + ")";
  hAht["message"] = aht20Message;

  JsonObject hMq = health["mq135"].to<JsonObject>();
  hMq["enabled"] = cfgMq135Enabled;
  hMq["ok"]      = mqOk;
  hMq["status"]  = mq135Status;
  hMq["raw_adc"] = lastMq135RawAdc;
  hMq["pin"]     = "GPIO" + String(cfgPinMq135);
  hMq["message"] = mq135Message;

  JsonObject hDoor = health["door_sensor"].to<JsonObject>();
  hDoor["enabled"]   = cfgDoorEnabled;
  hDoor["ok"]        = cfgDoorEnabled;
  hDoor["status"]    = cfgDoorEnabled ? "DIGITAL_INPUT" : "DISABLED";
  hDoor["raw_logic"] = lastDoorRawLogic;
  hDoor["pin"]       = "GPIO" + String(cfgPinDoor);
  hDoor["message"]   = cfgDoorEnabled
                         ? ("Digital 1-bit GPIO" + String(cfgPinDoor) + " (khong tu nhan dien rut day)")
                         : "Da vo hieu hoa theo doi cam bien cua tu Web";

  health["fault_count"] = faultCount;

  // Trạng thái các ngoại vi tùy chọn (nếu có)
  if (customPeripheralCount > 0) {
    JsonArray cpArr = doc["custom_peripherals"].to<JsonArray>();
    for (int i = 0; i < customPeripheralCount; i++) {
      CustomPeripheral& cp = customPeripherals[i];
      JsonObject c = cpArr.add<JsonObject>();
      c["id"]    = cp.id;
      c["type"]  = cp.type;
      c["gpio"]  = cp.gpio;
      c["value"] = cp.displayValue;
      if (cp.type == "RELAY_OUTPUT") {
        c["state"] = cp.outputState ? "ON" : "OFF";
      } else if (cp.type == "DIGITAL_INPUT") {
        c["state"] = cp.displayValue ? "ACTIVE" : "INACTIVE";
        c["raw_logic"] = cp.rawValue;
      } else {
        c["raw_adc"] = cp.rawValue;
      }
    }
  }

  doc["rssi"] = WiFi.RSSI();

  String buffer;
  serializeJson(doc, buffer);
  if (!mqttClient.publish(topicTelemetry.c_str(), buffer.c_str(), false)) Serial.println("[MQTT] Telemetry publish failed");

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
  JsonDocument cmdDoc;
  DeserializationError error = deserializeJson(cmdDoc, (const byte*)payload, length);
  if (error) {
    Serial.println("❌ [MQTT] Giai ma JSON lenh that bai!");
    return;
  }

  const char* cmdId = cmdDoc["cmd_id"];
  const char* cmdType = cmdDoc["type"];
  JsonObject payloadObj = cmdDoc["payload"];
  String incomingRegistration = cmdDoc["registration_id"] | "";

  if (!cmdId || !cmdType || (!cmdDoc["device_id"].isNull() && String(cmdDoc["device_id"].as<const char*>()) != runtimeDeviceId)) return;
  bool deactivating = strcmp(cmdType, "DEACTIVATE_NODE") == 0;
  bool resuming = strcmp(cmdType, "UPDATE_CONFIG") == 0 && nodeOutputsInhibited &&
    incomingRegistration.length() && incomingRegistration != registrationId;
  bool blocked = (registrationId.length() && incomingRegistration != registrationId && !resuming) ||
    (nodeOutputsInhibited && !deactivating && !resuming) ||
    (deactivating && !incomingRegistration.length());
  for (int i = 0; !blocked && i < 8; i++) {
    if (recentCommandIds[i] == cmdId) {
      mqttClient.publish(topicAck.c_str(), recentCommandAcks[i].c_str(), false);
      return;
    }
  }

  bool nvsSaved = true;
  String ackStatus = "SUCCESS";
  String ackMessage = "Lenh thuc thi thanh cong";

  if (blocked) {
    ackStatus = "FAILED";
    ackMessage = "Node outputs locked or stale registration; re-enroll node first";
  } else if (deactivating) {
    inhibitAllOutputs();
    registrationId = incomingRegistration;
    if (!saveNodeLifecycle(registrationId, true)) {
      ackStatus = "FAILED";
      ackMessage = "Outputs OFF but lifecycle NVS save failed; node must not be deleted";
    } else ackMessage = "All outputs OFF and locked in NVS until re-enrollment";
  } else if (strcmp(cmdType, "ACTUATOR_CONTROL") == 0) {
    const char* action = payloadObj["action"];
    const char* target = payloadObj["target"];
    const char* mode = payloadObj["control_mode"];

    if (!action || !target ||
        (strcmp(action, "TURN_ON") != 0 && strcmp(action, "TURN_OFF") != 0 && strcmp(action, "SET_AUTO") != 0) ||
        (strcmp(target, "VENTILATION_FAN") != 0 && strcmp(target, "ALARM_BUZZER") != 0 && strcmp(target, "CUSTOM_PERIPHERAL") != 0) ||
        (strcmp(action, "SET_AUTO") == 0 && strcmp(target, "VENTILATION_FAN") != 0) ||
        (mode && strcmp(mode, "AUTO") != 0 && strcmp(mode, "MANUAL") != 0)) {
      ackStatus = "FAILED"; ackMessage = "Invalid actuator command";
    }
    // 1. Điều khiển Quạt thông gió (Relay Kênh 1 - IN1)
    else if (strcmp(target, "VENTILATION_FAN") == 0) {
      if (!cfgFanEnabled) {
        setFanRelay(false);
        ackStatus = "FAILED";
        ackMessage = "Quat thong gio (Relay K1) dang bi tat trong cau hinh module";
      } else {
        if (mode) {
          controlMode = String(mode);
          if (!saveConfigToNVS()) { nvsSaved = false; ackStatus = "FAILED"; }
        }
        if (action && strcmp(action, "SET_AUTO") == 0) {
          controlMode = "AUTO";
          if (!saveConfigToNVS()) { nvsSaved = false; ackStatus = "FAILED"; }
          readSensors();
          ackMessage = "Quat thong gio da chuyen sang che do TU DONG";
        } else if (action && strcmp(action, "TURN_ON") == 0) {
          setFanRelay(true);
          ackMessage = "Relay K1 GPIO " + String(cfgPinFan) + " activated (Quat thong gio BAT)";
        } else if (action && strcmp(action, "TURN_OFF") == 0) {
          setFanRelay(false);
          ackMessage = "Relay K1 GPIO " + String(cfgPinFan) + " deactivated (Quat thong gio TAT)";
        }
      }
    }
    // 2. Điều khiển Còi báo động (Relay Kênh 2 - IN2) để test/bật tắt từ Web
    else if (strcmp(target, "ALARM_BUZZER") == 0) {
      if (!cfgBuzzerEnabled) {
        buzzerManualOverride = false;
        buzzerSilencedByUser = false;
        setBuzzerRelay(false);
        ackStatus = "FAILED";
        ackMessage = "Coi bao dong (Relay K2) dang bi tat trong cau hinh module";
      } else if (action && strcmp(action, "TURN_ON") == 0) {
        buzzerManualOverride = true;
        buzzerSilencedByUser = false;
        setBuzzerRelay(true);
        ackMessage = "Relay K2 GPIO " + String(cfgPinBuzzer) + " activated (Coi bao dong BAT)";
      } else if (action && strcmp(action, "TURN_OFF") == 0) {
        buzzerManualOverride = false;
        buzzerSilencedByUser = (currentRiskLevel == "HIGH_RISK");
        setBuzzerRelay(false);
        ackMessage = buzzerSilencedByUser
          ? ("Relay K2 GPIO " + String(cfgPinBuzzer) + " muted (Da tat coi thu cong trong dot canh bao)")
          : ("Relay K2 GPIO " + String(cfgPinBuzzer) + " deactivated (Coi bao dong TAT)");
      }
    }
    // 3. Điều khiển Ngoại vi tùy chọn (Relay ngõ ra thêm từ Web)
    else if (strcmp(target, "CUSTOM_PERIPHERAL") == 0) {
      const char* periphId = payloadObj["peripheral_id"];
      bool foundCp = false;
      if (periphId) {
        for (int i = 0; i < customPeripheralCount; i++) {
          if (customPeripherals[i].id == String(periphId) && customPeripherals[i].type == "RELAY_OUTPUT") {
            bool turnOn = action && strcmp(action, "TURN_ON") == 0;
            customPeripherals[i].outputState = turnOn;
            writeCustomRelayPin(customPeripherals[i]);
            customPeripherals[i].rawValue = turnOn ? 1 : 0;
            customPeripherals[i].displayValue = turnOn ? 1 : 0;
            foundCp = true;
            ackMessage = "Ngoai vi " + customPeripherals[i].name + " (GPIO " + String(customPeripherals[i].gpio) + ") " + (turnOn ? "BAT" : "TAT");
            break;
          }
        }
      }
      if (!foundCp) {
        ackStatus = "FAILED";
        ackMessage = "Khong tim thay ngoai vi tuy chon tren ESP32";
      }
    }
  } else if (cmdType && strcmp(cmdType, "UPDATE_CONFIG") == 0) {
    if (!validateConfig(payloadObj, ackMessage)) {
      ackStatus = "FAILED";
    } else {
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

      bool restartI2c = false;
      JsonObject periphObj = payloadObj["peripherals"];
      if (!periphObj.isNull()) {
        bool nextAht = periphObj["aht20_enabled"] | cfgAht20Enabled;
        bool nextDoor = periphObj["door_enabled"] | cfgDoorEnabled;
        bool nextFan = periphObj["fan_enabled"] | cfgFanEnabled;
        bool nextBuzzer = periphObj["buzzer_enabled"] | cfgBuzzerEnabled;
        uint8_t nextSda = periphObj["aht20_sda_gpio"] | cfgPinSda;
        uint8_t nextScl = periphObj["aht20_scl_gpio"] | cfgPinScl;
        uint8_t nextFanPin = periphObj["fan_gpio"] | cfgPinFan;
        uint8_t nextBuzzerPin = periphObj["buzzer_gpio"] | cfgPinBuzzer;
        uint8_t nextDoorPin = periphObj["door_gpio"] | cfgPinDoor;
        if (cfgAht20Enabled && (!nextAht || nextSda != cfgPinSda || nextScl != cfgPinScl)) {
          Wire.end(); pinMode(cfgPinSda, INPUT); pinMode(cfgPinScl, INPUT); hasRealAHT = false;
        }
        if (cfgFanEnabled && (!nextFan || nextFanPin != cfgPinFan)) {
          setRelayPin(cfgPinFan, false); pinMode(cfgPinFan, INPUT);
        }
        if (cfgBuzzerEnabled && (!nextBuzzer || nextBuzzerPin != cfgPinBuzzer)) {
          setRelayPin(cfgPinBuzzer, false); pinMode(cfgPinBuzzer, INPUT);
        }
        if (cfgDoorEnabled && (!nextDoor || nextDoorPin != cfgPinDoor)) pinMode(cfgPinDoor, INPUT);
        restartI2c = nextAht && (!cfgAht20Enabled || nextSda != cfgPinSda || nextScl != cfgPinScl);
        cfgPinSda = nextSda; cfgPinScl = nextScl;
        cfgPinMq135 = periphObj["mq135_gpio"] | cfgPinMq135;
        cfgPinDoor = nextDoorPin; cfgPinFan = nextFanPin; cfgPinBuzzer = nextBuzzerPin;

        if (!periphObj["aht20_enabled"].isNull())  cfgAht20Enabled  = periphObj["aht20_enabled"].as<bool>();
        if (!periphObj["mq135_enabled"].isNull())  cfgMq135Enabled  = periphObj["mq135_enabled"].as<bool>();
        if (!periphObj["door_enabled"].isNull())   cfgDoorEnabled   = periphObj["door_enabled"].as<bool>();
        if (!periphObj["fan_enabled"].isNull())    cfgFanEnabled    = periphObj["fan_enabled"].as<bool>();
        if (!periphObj["buzzer_enabled"].isNull()) cfgBuzzerEnabled = periphObj["buzzer_enabled"].as<bool>();
        if (!periphObj["buzzer_auto"].isNull()) {
          bool prevBuzzerAuto = cfgBuzzerAuto;
          cfgBuzzerAuto = periphObj["buzzer_auto"].as<bool>();
          if (!prevBuzzerAuto && cfgBuzzerAuto) buzzerSilencedByUser = false;
        }
        if (!periphObj["fan_auto"].isNull()) {
          controlMode = periphObj["fan_auto"].as<bool>() ? "AUTO" : "MANUAL";
        }
        if (!cfgFanEnabled) setFanRelay(false);
        if (!cfgBuzzerEnabled) {
          buzzerManualOverride = false;
          buzzerSilencedByUser = false;
          setBuzzerRelay(false);
        }
      }

      if (payloadObj["custom_peripherals"].is<JsonArray>()) {
        parseCustomPeripheralsArray(payloadObj["custom_peripherals"].as<JsonArray>(), true);
      }

      if (restartI2c) { Wire.begin(cfgPinSda, cfgPinScl); Wire.setClock(100000); Wire.setTimeOut(50); }
      if (cfgFanEnabled) { pinMode(cfgPinFan, OUTPUT); setFanRelay(fanState); }
      if (cfgBuzzerEnabled) { pinMode(cfgPinBuzzer, OUTPUT); setBuzzerRelay(buzzerState); }
      if (cfgDoorEnabled) pinMode(cfgPinDoor, DOOR_PIN_MODE);
      applyCustomPeripheralsHardware();
      if (!saveConfigToNVS()) ackStatus = "FAILED";
      if (ackStatus == "SUCCESS" && incomingRegistration.length() && (resuming || registrationId != incomingRegistration)) {
        if (saveNodeLifecycle(incomingRegistration, false)) {
          registrationId = incomingRegistration;
          nodeOutputsInhibited = false;
        } else {
          inhibitAllOutputs();
          ackStatus = "FAILED";
        }
      }
      readSensors();
      ackMessage = ackStatus == "SUCCESS" ? "Da cap nhat & luu NVS cau hinh module/nguong thanh cong" : "NVS save failed";
    }
  } else {
    ackStatus = "FAILED"; ackMessage = "Unsupported command type";
  }

  // ACK immediately after applying the command; no blocking delay.

  JsonDocument ackDoc;
  ackDoc["cmd_id"]      = cmdId ? cmdId : "cmd_unknown";
  ackDoc["device_id"]   = runtimeDeviceId;
  ackDoc["registration_id"] = registrationId;
  ackDoc["status"]      = ackStatus;
  ackDoc["executed_at"] = millis();

  JsonObject currentActs = ackDoc["current_actuators"].to<JsonObject>();
  currentActs["fan_state"]    = fanState ? "ON" : "OFF";
  currentActs["buzzer_state"] = buzzerState ? "ON" : "OFF";
  currentActs["door_state"]   = isDoorOpen ? "OPEN" : "CLOSED";
  currentActs["control_mode"] = controlMode;
  currentActs["outputs_inhibited"] = nodeOutputsInhibited;
  {
    JsonObject cpStates = currentActs["custom_peripherals"].to<JsonObject>();
    for (int i = 0; i < customPeripheralCount; i++) {
      if (customPeripherals[i].type == "RELAY_OUTPUT") {
        cpStates[customPeripherals[i].id] = customPeripherals[i].outputState ? "ON" : "OFF";
      }
    }
  }

  if (!nvsSaved) ackMessage = "NVS save failed";
  ackDoc["message"] = ackMessage;

  String ackBuffer;
  serializeJson(ackDoc, ackBuffer);
  recentCommandIds[nextCommandCache] = cmdId;
  recentCommandAcks[nextCommandCache] = ackBuffer;
  nextCommandCache = (nextCommandCache + 1) % 8;
  mqttClient.publish(topicAck.c_str(), ackBuffer.c_str(), false);
  if (ackStatus == "SUCCESS") sendTelemetry();

  Serial.printf("📤 [MQTT ACK] Da gui phan hoi ACK: %s\n", ackMessage.c_str());
}

// =============================================================================
// QUẢN LÝ KẾT NỐI WI-FI VÀ MQTT BROKER (NON-BLOCKING AUTO-RECONNECT)
// =============================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("📡 [Wi-Fi] Dang ket noi toi SSID: %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  static unsigned long lastAttempt = 0;
  static bool attempted = false;
  if (attempted && millis() - lastAttempt < 10000) return;
  attempted = true; lastAttempt = millis();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);


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
  bootNonce = esp_random();
  initDeviceIdentity();
  loadNodeLifecycle();
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
  if (cfgFanEnabled) pinMode(cfgPinFan, OUTPUT);
  if (cfgBuzzerEnabled) pinMode(cfgPinBuzzer, OUTPUT);
  if (cfgDoorEnabled) pinMode(cfgPinDoor, DOOR_PIN_MODE);
  applyCustomPeripheralsHardware();

  // Trạng thái ban đầu: Tắt Quạt, Tắt Còi
  setFanRelay(false);
  setBuzzerRelay(false);

  // 2. Khởi tạo Bus I2C (mặc định SDA=21, SCL=22, 100kHz, timeout 50ms)
  if (cfgAht20Enabled) {
    Wire.begin(cfgPinSda, cfgPinScl);
    Wire.setClock(100000);
    Wire.setTimeOut(50);

    // 3. Khởi tạo Cảm biến AHT20 (Địa chỉ mặc định 0x38, nguồn 3.3V)
    uint8_t initProbeErr = probeI2CAddress(AHT20_I2C_ADDR);
    if (initProbeErr == 0 && aht.begin(&Wire, 0, AHT20_I2C_ADDR)) {
      hasRealAHT = true;
      aht20Connected = true;
      aht20Status = "OK";
      aht20Message = "Ket noi I2C 0x38 on dinh";
      lastAhtDiagnosticMsg = aht20Message;
      Serial.println("✅ [Hardware] Cam bien nhiet am AHT20 san sang (I2C 0x38)!");
    } else {
      hasRealAHT = false;
      aht20Connected = false;
      if (initProbeErr == 0) {
        aht20Status = "READ_ERROR";
        char errBuf[140];
        snprintf(errBuf, sizeof(errBuf),
                 "Thay dia chi 0x38 nhung khoi tao AHT20 that bai (status=0x%02X)", aht.getStatus());
        aht20Message = String(errBuf);
      } else {
        aht20Status = ENABLE_SENSOR_SIMULATION_FALLBACK ? "SIMULATED" : "DISCONNECTED";
        aht20Message = diagnoseAht20I2CBus(initProbeErr);
      }
      lastAhtDiagnosticMsg = aht20Message;
      Serial.printf("⚠️ [Hardware/AHT20] %s\n", aht20Message.c_str());
    }
  }

  // 4. Buffer includes the full UTF-8 configuration, sensor health, and custom peripherals.
  mqttClient.setServer(MQTT_SERVER_IP, MQTT_SERVER_PORT);
  mqttClient.setCallback(handleIncomingCommand);
  mqttClient.setBufferSize(MQTT_BUFFER_BYTES);
  mqttClient.setSocketTimeout(2);

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
