#ifndef CONFIG_H
#define CONFIG_H

// Chỉ include Arduino.h khi đang biên dịch trong môi trường Arduino / PlatformIO
#ifdef ARDUINO
  #include <Arduino.h>
#else
  #ifndef HIGH
    #define HIGH 1
  #endif
  #ifndef LOW
    #define LOW 0
  #endif
#endif

// =============================================================================
// 1. CẤU HÌNH KẾT NỐI WI-FI VÀ MQTT BROKER
// =============================================================================
// Thay đổi thông tin mạng Wi-Fi của bạn tại đây:
#define WIFI_SSID           "Your_WiFi_SSID"
#define WIFI_PASSWORD       "Your_WiFi_Password"

// Địa chỉ IP của máy tính chạy Docker Mosquitto MQTT Broker (VD: "192.168.1.100")
// Lưu ý: KHÔNG dùng "localhost" hay "127.0.0.1" vì ESP32 kết nối qua mạng LAN
#define MQTT_SERVER_IP      "192.168.1.100"
#define MQTT_SERVER_PORT    1883
#define MQTT_USERNAME       ""
#define MQTT_PASSWORD       ""

// =============================================================================
// 2. ĐỊNH DANH THIẾT BỊ (DEVICE IDENTITY & PROVISIONING)
// =============================================================================
#define DEVICE_ID           "DEV_SILO_01"
#define FIRMWARE_VERSION    "1.0.2"
#define HARDWARE_VERSION    "ESP32-WROOM-32-v1"

// Chu kỳ lấy mẫu và gửi bản tin Telemetry mặc định (ms)
#define DEFAULT_SAMPLING_INTERVAL_MS 3000

// =============================================================================
// 3. SƠ ĐỒ ĐẤU NỐI CHÂN GPIO THEO SƠ ĐỒ MẠCH THỰC TẾ
// =============================================================================
// Bus I2C dùng chung cho Cảm biến AHT20 (Nhiệt/Ẩm) và BMP280 (Áp suất khí quyển)
#define PIN_I2C_SDA         21
#define PIN_I2C_SCL         22
#define AHT20_I2C_ADDR      0x38  // Địa chỉ I2C mặc định của AHT20
#define BMP280_I2C_ADDR     0x76  // Địa chỉ I2C của BMP280 (0x76 hoặc 0x77)
#define OLED_I2C_ADDR       0x3C  // Màn hình OLED (nếu có cắm kèm)
#define SCREEN_WIDTH        128
#define SCREEN_HEIGHT       64

// Cảm biến chất lượng không khí & khí Gas lên men MQ-135
// Sử dụng chân ADC1 (GPIO 34) an toàn khi đang bật Wi-Fi
#define PIN_MQ135_ANALOG    34

// Cảm biến Hall phát hiện đóng/mở cửa kho Silo (Hall A3122)
// Ngõ ra OUT nối GPIO 27 (kèm điện trở kéo xuống 10kΩ về GND)
#define PIN_DOOR_SENSOR     27

// Cơ cấu chấp hành: Module Relay 2 kênh 5VDC
#define PIN_RELAY_FAN       26    // Relay kênh 1 (IN1): Đóng ngắt Quạt thông gió 5V
#define PIN_RELAY_BUZZER    25    // Relay kênh 2 (IN2): Đóng ngắt Còi báo động 5V

// Mức kích hoạt Relay: Module Relay 2 kênh màu xanh kích hoạt ở mức LOW (Active LOW)
// Khi xuất LOW -> Relay đóng tiếp điểm COM-NO -> Bật Quạt/Còi
#define RELAY_ACTIVE_LEVEL  LOW   // LOW cho Module Relay Active-Low (đổi sang HIGH nếu dùng module Active-High)

// =============================================================================
// 4. NGƯỠNG AN TOÀN VI KHÍ HẬU MẶC ĐỊNH THEO TCVN 8370:2018
// =============================================================================
#define THRESHOLD_TEMP_WARN 25.0f // Ngưỡng nhiệt độ cảnh báo (°C)
#define THRESHOLD_TEMP_CRIT 28.0f // Ngưỡng nhiệt độ nguy hiểm (°C)
#define THRESHOLD_HUM_WARN  65.0f // Độ ẩm không khí cảnh báo (%RH)
#define THRESHOLD_HUM_CRIT  70.0f // Độ ẩm không khí nguy hiểm (%RH)
#define THRESHOLD_EMC_WARN  14.0f // Độ ẩm hạt cảnh báo (%MC - TCVN)
#define THRESHOLD_EMC_CRIT  14.8f // Độ ẩm hạt nguy hiểm (%MC)
#define THRESHOLD_GAS_WARN  600.0f // Nồng độ khí gas lên men cảnh báo (ppm)
#define THRESHOLD_GAS_CRIT  700.0f // Nồng độ khí gas nguy hiểm (ppm)

#endif // CONFIG_H
