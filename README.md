# Smart Grain Storage Monitoring & Preservation System
> **Đồ Án IoT và Ứng Dụng:** Hệ Thống Giám Sát và Điều Khiển Vi Khí Hậu Bảo Quản Kho Ngũ Cốc

---

## 1. Giới thiệu & Tính năng chính

Ngũ cốc sau thu hoạch (thóc, gạo, ngô) dễ hút ẩm (*hygroscopic*), tự bốc nóng và lên men sinh khí độc hại ($\text{CO}_2, \text{NH}_3$) khi độ ẩm vượt ngưỡng bảo quản. Hệ thống giải quyết bài toán này với các tính năng:

1. **Giám sát vi khí hậu 24/7 theo thời gian thực:** Thu thập Nhiệt độ ($^\circ\text{C}$), Độ ẩm không khí ($\%\text{RH}$), Khí gas ($\text{ppm}$), trạng thái cửa kho và tự động tính **Độ ẩm cân bằng hạt ($\%\text{MC}$ / EMC)** theo mô hình Modified Halsey.
2. **Tự động phát hiện lỗi cảm biến phần cứng (`sensor_health`):** ESP32 kiểm tra thực tế từng cảm biến (chẩn đoán bus I2C `AHT20` tại `0x38`, ADC `MQ-135` qua cầu chia áp) và báo trạng thái `OK` / `DISCONNECTED` / `OUT_OF_RANGE` / `DISABLED` lên Web theo thời gian thực.
3. **Quản lý Thiết bị Ngoại vi, Chân GPIO & Lưu cấu hình vào Flash NVS:** Chủ kho (`ADMIN`) có thể thêm/xóa thiết bị chuẩn (`AHT20` I2C 2 chân `21/22`, `MQ-135`, Cửa kho, Quạt, Còi) hoặc tạo thêm ngoại vi GPIO mở rộng (`Relay`, `Digital Input`, `Analog Input`), chọn/đổi chân cắm và đồng bộ ngưỡng cảnh báo (`Nhiệt độ`, `Độ ẩm`, `Ẩm hạt EMC`, `Khí Gas`) xuống **Flash NVS** của ESP32 để không mất cấu hình khi cúp điện.
4. **Quản lý thiết bị, Khu vực kho & Tự động phát hiện node mới:** CRUD khu vực kho, quản lý người dùng, onboard/sửa/xóa node, quản lý vòng đời thiết bị (`ACTIVE`, `MAINTENANCE`, `SUSPENDED`, `DECOMMISSIONED`), tự động nhận diện ESP32 kết nối MQTT chưa đăng ký.
5. **Phân quyền RBAC thực tế 3 vai trò:** `Chủ kho (ADMIN)`, `Vận hành (OPERATOR)` và `Giám sát / QC (VIEWER)` xác thực bằng JWT và kiểm soát chặt chẽ cả trên Backend API (`403 Forbidden`) lẫn giao diện Web.

---

## 2. Cấu trúc Dự án

```text
BTL_IOT/
├── IOT_Firmware/               # Mã nguồn C++ PlatformIO cho ESP32-WROOM-32D
│   ├── src/
│   │   ├── config.h            # Cấu hình Wi-Fi, IP MQTT Broker, chân GPIO & ngưỡng mặc định
│   │   └── main.cpp            # Logic cảm biến, NVS Preferences, MQTT, Relay, ngoại vi GPIO & ACK
│   ├── platformio.ini          # Cấu hình build PlatformIO (tự động dò cổng COM USB)
│   └── README.md               # Tài liệu chi tiết phần cứng & luồng firmware
├── backend/                    # API & MQTT/Socket.IO Server (Node.js / Express / TypeScript)
├── frontend/                   # Giao diện Web Dashboard (React / Vite / TailwindCSS / Recharts)
├── database/
│   ├── schema.prisma           # Prisma Schema (7 bảng PostgreSQL)
│   └── seed.ts                 # Nạp sẵn 6 tài khoản mẫu (admin/operator/viewer), 2 kho, 2 node mẫu
├── deployment/
│   ├── docker-compose.yml      # Container PostgreSQL 16 & Eclipse Mosquitto 2.0
│   └── mosquitto.conf          # Cấu hình MQTT Broker (1883 TCP, 9001 WebSocket)
├── tests/
│   └── simulator.ts            # Thiết bị ESP32 ảo dùng để demo không cần mạch thật
├── BTL_IOT.code-workspace      # Workspace VS Code cho cả BTL_IOT và PlatformIO (IOT_Firmware)
├── HUONG_DAN_CHAY_DEMO.md      # Hướng dẫn chạy demo chi tiết từng bước & kịch bản thuyết trình
├── .env.example                # Mẫu biến môi trường cho Backend & Database
└── package.json                # Scripts gốc (Backend, Frontend, Prisma, Docker, Simulator)
```

---

## 3. Yêu cầu Môi trường

Trước khi clone về chạy, máy tính cần cài sẵn:
- **Node.js** `v18+` hoặc `v20+` (kèm `npm`)
- **Docker Desktop** (để chạy PostgreSQL & MQTT Broker Mosquitto; nhớ mở Docker Desktop trước khi khởi chạy)
- **Git**
- *(Tùy chọn, nếu nạp mạch ESP32 thật)* **VS Code** + extension **PlatformIO IDE**

---

## 4. Hướng dẫn Clone về & Cài đặt Lần đầu

### Bước 1: Clone repository và tạo file `.env`
```bash
git clone https://github.com/Labyrinth-solv/BTL_IOT.git
cd BTL_IOT
cp .env.example .env
```
> Trên PowerShell (Windows), lệnh `cp .env.example .env` hoặc `Copy-Item .env.example .env` đều hoạt động.

### Bước 2: Cài đặt thư viện (cả Root/Backend và Frontend)
```bash
# Cài dependencies cho Backend, Prisma và Simulator
npm install

# Cài dependencies cho giao diện Web Frontend
npm --prefix frontend install
```

### Bước 3: Khởi động PostgreSQL & MQTT Broker bằng Docker
> Đảm bảo **Docker Desktop** đang mở và ở trạng thái `Engine running`.
```bash
npm run docker:up
# Kiểm tra 2 container (postgres-db, mosquitto-broker) đã chạy:
docker compose -f deployment/docker-compose.yml ps
```

### Bước 4: Sinh Prisma Client, tạo bảng & nạp dữ liệu mẫu
```bash
npm run db:generate
npm run db:push
npm run db:seed
```
> **Lưu ý khi `git pull` bản mới:** Nếu bạn đã từng cài đặt trước đó và database cũ đã tồn tại, hãy chạy lại `npm run db:seed` để cập nhật thêm các tài khoản đăng nhập ngắn (`admin`, `operator`, `viewer`) vào PostgreSQL cục bộ.

---

## 5. Khởi chạy Hệ thống

Tùy vào việc bạn chạy **giả lập** hay chạy với **ESP32 thật**:

### Cách A: Chạy với Bộ giả lập (Không cần mạch ESP32)
Mở **3 Terminal** tại thư mục gốc `BTL_IOT`:
1. **Terminal 1 — Backend Server (`http://localhost:4000`):**
   ```bash
   npm run dev
   ```
2. **Terminal 2 — Thiết bị giả lập `DEV_SILO_01`:**
   ```bash
   npm run simulator
   ```
3. **Terminal 3 — Web Frontend (`http://localhost:5173`):**
   ```bash
   npm run frontend:dev
   ```

### Cách B: Chạy với Mạch ESP32 thật (`IOT_Firmware`)
1. Chỉ cần mở **2 Terminal** chạy `npm run dev` (Backend) và `npm run frontend:dev` (Frontend) — **không chạy `npm run simulator`** để tránh đụng ID `DEV_SILO_01`.
2. Mở file [BTL_IOT.code-workspace](./BTL_IOT.code-workspace) bằng VS Code (để extension PlatformIO nhận đúng dự án `IOT_Firmware`).
3. Sửa thông tin Wi-Fi và IPv4 của máy tính chạy Mosquitto trong [IOT_Firmware/src/config.h](./IOT_Firmware/src/config.h):
   - `WIFI_SSID`, `WIFI_PASSWORD` (bắt buộc Wi-Fi băng tần **2.4 GHz** cùng mạng LAN với máy tính).
   - `MQTT_SERVER_IP`: địa chỉ IPv4 LAN của máy tính chạy Docker Mosquitto (xem bằng `ipconfig` trên Windows hoặc `ifconfig`/`ip a` trên macOS/Linux).
   - *(Nếu nạp nhiều mạch ESP32)*: đặt `#define USE_MAC_AS_DEVICE_ID true` để mỗi mạch tự sinh mã `ESP32_XXXXXX` theo MAC, không cần sửa `DEVICE_ID` thủ công.
4. Cắm cáp USB (loại truyền được dữ liệu) vào ESP32 → bấm nút **Upload (`→`)** trên PlatformIO (cấu hình trong [platformio.ini](./IOT_Firmware/platformio.ini) đã để tự động dò cổng COM).
5. **Lưu ý Firewall Windows:** nếu ESP32 báo không kết nối được MQTT (`rc=-2`), cần mở cổng TCP **1883** trên Windows Defender Firewall cho phép kết nối trong mạng LAN.

Truy cập Web tại: **[http://localhost:5173](http://localhost:5173)**  
Xem thêm kịch bản thuyết trình & xử lý lỗi chi tiết tại [HUONG_DAN_CHAY_DEMO.md](./HUONG_DAN_CHAY_DEMO.md) và hướng dẫn đấu dây ESP32 tại [IOT_Firmware/README.md](./IOT_Firmware/README.md).

---

## 6. Tài khoản Mẫu & Phân quyền RBAC

Hệ thống sử dụng đăng nhập thực tế (JWT) với phân quyền RBAC kiểm soát cả ở Backend API và giao diện Web. Khi chạy `npm run db:seed`, hệ thống tạo sẵn các tài khoản sau (có thể đăng nhập bằng **tên ngắn** hoặc **email đầy đủ**):

| Vai trò trên Web | Mã Role | Tên đăng nhập / Email & Mật khẩu | Quyền hạn chính |
| :--- | :---: | :--- | :--- |
| **Chủ kho (Admin)** | `ADMIN` | `admin` / `admin123`<br>(hoặc `admin@grain.com` / `admin123`) | Toàn quyền: Thêm/Sửa/Xóa khu vực kho & người dùng, Onboard/Đình chỉ/Thu hồi/Xóa thiết bị, **thêm/xóa/cấu hình thiết bị ngoại vi & chân GPIO**, xem Audit Logs, xóa cảnh báo, chỉnh ngưỡng & điều khiển thiết bị |
| **Vận hành (Operator)** | `OPERATOR` | `operator` / `operator123`<br>(hoặc `operator@grain.com` / `operator123`) | Vận hành kho: điều khiển Quạt/Còi/ngoại vi Relay, xử lý cảnh báo (`ACK`/`Resolve`), bật/tắt bảo trì, sửa thông tin node, **chỉnh ngưỡng cảnh báo & chu kỳ gửi (lưu NVS ESP32)** *(không được thêm/xóa ngoại vi GPIO hoặc CRUD kho/người dùng)* |
| **Giám sát / QC (Chỉ xem)** | `VIEWER` | `viewer` / `viewer123`<br>(hoặc `viewer@grain.com` / `viewer123`) | Chỉ xem Dashboard, chi tiết & biểu đồ cảm biến (Nhiệt, Ẩm, EMC, Khí Gas), chẩn đoán cảm biến, danh sách kho & cảnh báo (mọi thao tác điều khiển/cấu hình bị khóa và API trả `403`) |

---

## 7. Dữ liệu Kho & Thiết bị Tạo Sẵn (`db:seed`)
- **2 Khu vực kho mẫu:** `Kho Silo Thóc Tẻ A1` và `Kho Silo Thóc Tẻ B2` (loại ngũ cốc: `Thóc tẻ`).
- **2 Thiết bị mẫu:** `DEV_SILO_01` (`ACTIVE`, Silo A1) và `DEV_SILO_02` (`PROVISIONED`, Silo B2).
