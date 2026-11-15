# 🌾 HƯỚNG DẪN CÀI ĐẶT & CHẠY DEMO SMART GRAIN STORAGE IOT
> **Đề tài:** Hệ Thống Giám Sát & Bảo Quản Vi Khí Hậu Kho Ngũ Cốc Thông Minh (TCVN 8370:2018)  
> **Dành cho:** Người mới clone repository về chạy thử, thành viên nhóm thuyết trình & kiểm thử.

---

## 📌 1. Yêu Cầu Cài Đặt Trước (Prerequisites)

Đảm bảo máy tính đã cài:
1. **Node.js** (`v18` hoặc `v20` trở lên, kèm `npm`).
2. **Docker Desktop** (phải đang được mở và chạy nền).
3. **Git**.
4. *(Nếu chạy với ESP32 thật)* **VS Code** + extension **PlatformIO IDE** và cáp USB truyền dữ liệu.

---

## 🚀 2. Cài Đặt Lần Đầu Sau Khi Clone (Làm 1 lần duy nhất)

Mở **PowerShell** / **Terminal** tại thư mục gốc dự án (`BTL_IOT`):

### Bước 2.1: Cài đặt thư viện cho Backend và Frontend
```powershell
# 1. Cài thư viện Backend, Prisma & Simulator
npm install

# 2. Cài thư viện Frontend (Vite + React)
npm --prefix frontend install
```

### Bước 2.2: Tạo file biến môi trường `.env`
```powershell
cp .env.example .env
```
*(Mặc định trong `.env.example` đã khớp sẵn với cấu hình PostgreSQL & Mosquitto của Docker Compose).*

### Bước 2.3: Khởi động Docker (PostgreSQL 16 & Eclipse Mosquitto)
> ⚠️ **Lưu ý:** Mở phần mềm **Docker Desktop** trên máy và chờ trạng thái chạy xong trước khi gõ lệnh dưới:
```powershell
npm run docker:up
```

### Bước 2.4: Sinh Prisma Client, khởi tạo bảng và nạp dữ liệu mẫu
```powershell
npm run db:generate
npm run db:push
npm run db:seed
```
*(Lệnh `db:seed` tạo sẵn 3 tài khoản theo 3 vai trò, 2 khu vực kho Silo A1/B2 và 2 node `DEV_SILO_01`, `DEV_SILO_02`).*

---

## 💻 3. Khởi Chạy Hệ Thống

### Phương án A: Chạy Demo bằng Simulator (Không cần mạch ESP32 thật)
Mở **3 Terminal** riêng biệt tại thư mục gốc `BTL_IOT`:

- **Terminal 1 — Backend Server (Port `4000`):**
  ```powershell
  npm run dev
  ```
- **Terminal 2 — Hardware Simulator (`DEV_SILO_01` giả lập):**
  ```powershell
  npm run simulator
  ```
- **Terminal 3 — Web Frontend (Port `5173`):**
  ```powershell
  npm run frontend:dev
  ```

### Phương án B: Chạy với Mạch ESP32 Thật (`IOT_Firmware`)
1. Chỉ chạy **2 Terminal**: `npm run dev` (Backend) và `npm run frontend:dev` (Frontend). *(Không bật `npm run simulator` nếu mạch ESP32 cũng dùng `DEV_SILO_01` để tránh đụng MQTT ClientID).*
2. Mở file [BTL_IOT.code-workspace](./BTL_IOT.code-workspace) trong **VS Code** để PlatformIO nhận đúng dự án [IOT_Firmware](./IOT_Firmware).
3. Mở [IOT_Firmware/src/config.h](./IOT_Firmware/src/config.h) và cập nhật:
   - `WIFI_SSID` & `WIFI_PASSWORD` (Wi-Fi **2.4 GHz**).
   - `MQTT_SERVER_IP`: điền IPv4 của máy tính đang chạy Docker Mosquitto (xem qua lệnh `ipconfig` trong PowerShell).
   - `USE_MAC_AS_DEVICE_ID`: để `false` nếu muốn dùng cố định `DEVICE_ID = "DEV_SILO_01"`, hoặc bật `true` nếu nạp cùng 1 code cho nhiều ESP32 (`ESP32_XXXXXX`).
4. Cắm ESP32 qua cáp USB và nhấn **Upload (`→`)** trên thanh công cụ PlatformIO dưới đáy VS Code (`platformio.ini` tự động dò cổng COM).

---

## 🌐 4. Đăng Nhập & Phân Quyền Trên Web

Truy cập **[http://localhost:5173](http://localhost:5173)** trên Chrome / Edge.

Hệ thống bật **phân quyền RBAC thực tế** cả trên giao diện lẫn Backend API (`403 Forbidden`):
- Tại màn hình Login hoặc thanh trên cùng (**Đổi vai trò**), bạn có thể chuyển nhanh giữa 3 tài khoản mẫu:
  1. **Chủ kho (Admin)** — `admin@grain.com` / `admin123`: Toàn quyền quản trị (Onboard/Đình chỉ/Thu hồi/Xóa node, tạo kho mới, quản lý Users, Audit Logs, xóa toàn bộ cảnh báo, vận hành & cấu hình).
  2. **Vận hành (Operator)** — `operator@grain.com` / `operator123`: Vận hành kho (bật/tắt quạt & còi, ACK/Resolve cảnh báo, bật/tắt bảo trì, sửa thông tin thiết bị, **đổi ngưỡng & bật/tắt module trên ESP32**).
  3. **Giám sát / QC (Chỉ xem)** — `viewer@grain.com` / `viewer123`: Chỉ xem Dashboard, biểu đồ, chẩn đoán cảm biến, danh sách kho/cảnh báo và xuất CSV (khóa toàn bộ nút điều khiển & thay đổi cấu hình).

---

## 🎬 5. Kịch Bản Thuyết Trình Demo (5 - 7 Phút)

| Bước | Tên tính năng | Thao tác trên Web | Điểm nhấn cần trình bày |
| :---: | :--- | :--- | :--- |
| **1** | **Dashboard & Chuẩn TCVN 8370** | Vào **Dashboard Tổng quan**. | - Theo dõi Nhiệt độ, Độ ẩm `%RH`, **Độ ẩm cân bằng hạt EMC (`%MC`)** theo mô hình Halsey, Khí Gas `MQ-135` và trạng thái cửa kho.<br>- Nếu thiết bị đang `OFFLINE` nhưng từng có dữ liệu cũ, card tự làm mờ và hiện dòng *"Dữ liệu lưu lần cuối"* kèm mốc thời gian để không nhầm với dữ liệu live. |
| **2** | **Chẩn đoán Cảm biến & Phát hiện rút dây** | Xem khung **Tình trạng phần cứng cảm biến** dưới mỗi thẻ (hoặc trong trang Chi tiết). | - ESP32 kiểm tra định kỳ `AHT20` (`I2C 0x38`) và `MQ-135` (`ADC GPIO34`). Nếu cảm biến chưa cắm hoặc mất tín hiệu, hệ thống cảnh báo ngay `KHÔNG NHẬN` / `MẤT TÍN HIỆU` thay vì hiển thị số `0` gây hiểu nhầm. |
| **3** | **Điều khiển Quạt / Còi & Phản hồi ACK** | Gạt công tắc **Quạt** hoặc bấm **Test Còi** trên thẻ Silo. | - Giao diện hiển thị chờ `Pending ACK...` trong lúc Backend phát lệnh MQTT `/cmd`. Khi ESP32 / Simulator đóng Relay và phản hồi `/ack`, UI cập nhật ngay trạng thái thực tế. |
| **4** | **Quản lý từng Module & Đồng bộ NVS** | Vào **Chi tiết & Biểu đồ** → mục **Quản Lý Từng Module & Ngoại Vi Trên ESP32** và **Cấu Hình Ngưỡng**. | - Cho phép bật/tắt theo dõi từng cảm biến (`AHT20`, `MQ-135`, `Cảm biến cửa`) nếu node không lắp đủ phần cứng, bật/tắt quyền và chế độ `AUTO` cho Relay Quạt/Còi, sửa ngưỡng cảnh báo/nguy cấp.<br>- Khi bấm Lưu, cấu hình đồng bộ qua MQTT xuống **Flash NVS** của ESP32 (không mất khi mất điện). |
| **5** | **Giả lập Sự cố & Quy trình SOP** | Mở nút **Hardware Simulator** (khi chạy Simulator) hoặc tạo ngưỡng vượt thực tế, rồi vào **Trung tâm Cảnh báo**. | - Khi nhiệt/ẩm/gas vượt ngưỡng: Rule Engine chuyển mức `WARNING` / `HIGH RISK`, tự động kích hoạt quạt đối lưu & cảnh báo.<br>- Nhân viên vận hành thực hiện quy trình **Xác nhận (`ACK`) → Hoàn tất (`Resolve`)** có ghi chú. |
| **6** | **Auto-Discovery & Quản lý Thiết bị** | Chuyển sang quyền **Chủ kho (Admin)** → vào **Quản lý Thiết bị**. | - Nếu có ESP32 mới kết nối MQTT chưa có trong DB, banner **Auto-Discovery** tự hiện IP/MAC/ChipID để bấm **"Thêm ngay (Onboard)"**.<br>- Demo đầy đủ vòng đời thiết bị (Kích hoạt, Bảo trì, Đình chỉ, Thu hồi, Xóa hẳn). |
| **7** | **Phân quyền RBAC & Audit Logs** | Chuyển vai trò trên Navbar sang **Giám sát QC** rồi sang **Chủ kho (Admin)** → mở **Nhật ký Audit Logs**. | - Ở vai trò **Giám sát QC**: các nút điều khiển/cài đặt bị khóa, mục Quản lý Users & Audit Logs được ẩn.<br>- Ở vai trò **Chủ kho (Admin)**: xem toàn bộ vết thao tác lưu bất biến trong Audit Logs. |

---

## 🛠️ 6. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

### ❓ 1. Docker báo lỗi `"open //./pipe/dockerDesktopLinuxEngine..."`
- **Nguyên nhân:** Docker Desktop chưa chạy.
- **Cách xử lý:** Mở ứng dụng **Docker Desktop**, đợi biểu tượng ở khay hệ thống hết xoay (`Engine running`), rồi chạy lại `npm run docker:up`.

### ❓ 2. Lỗi thiếu `@prisma/client` hoặc `Cannot find module '.prisma/client'` khi chạy `npm run dev`
- **Nguyên nhân:** Quên sinh Prisma Client sau khi clone.
- **Cách xử lý:** Chạy `npm run db:generate` rồi `npm run db:push` và `npm run db:seed`.

### ❓ 3. Dashboard hiện `0 nodes` hoặc không đăng nhập được
- **Cách xử lý:** Kiểm tra Backend Terminal 1 đã kết nối PostgreSQL thành công chưa, sau đó chạy lại `npm run db:seed` để nạp tài khoản và 2 node mẫu.

### ❓ 4. ESP32 thật báo `[MQTT] Ket noi that bai, rc=-2`
- **Nguyên nhân:**
  1. Sai `MQTT_SERVER_IP` trong [IOT_Firmware/src/config.h](./IOT_Firmware/src/config.h), hoặc ESP32 đang bắt Wi-Fi 5GHz / khác mạng LAN với máy tính.
  2. **Windows Firewall chặn cổng `1883`:** Mở *Windows Defender Firewall → Inbound Rules → New Rule → Port TCP `1883` → Allow the connection*.

### ❓ 5. Lỗi cổng `4000` hoặc `5173` đang bị chiếm (`EADDRINUSE`)
- **Cách xử lý (PowerShell):**
  ```powershell
  Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
  ```
  Sau đó bật lại các Terminal chạy Backend / Frontend.

### ❓ 6. Cắm ESP32 nhưng PlatformIO không thấy cổng COM
- **Cách xử lý:** Kiểm tra lại cáp USB (nhiều dây chỉ sạc được, không có lõi truyền dữ liệu), hoặc cài thêm driver USB-UART (**CP210x** / **CH340**) cho Windows. File [IOT_Firmware/platformio.ini](./IOT_Firmware/platformio.ini) đã tắt cố định `COM3` để tự động dò đúng cổng ESP32 đang cắm.
