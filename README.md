# Smart Grain Storage Monitoring & Preservation System
> **Đồ Án IoT và Ứng Dụng:** Hệ Thống Giám Sát và Điều Khiển Vi Khí Hậu Bảo Quản Kho Ngũ Cốc
> **Quy Chuẩn Áp Dụng:** TCVN 8370:2018, TCVN 8368:2018 & Khuyến nghị IRRI

---

## 1. Giới thiệu Bài toán

Ngũ cốc sau thu hoạch (thóc, gạo, ngô) là vật liệu có tính hút ẩm tự nhiên (*hygroscopic*). Trong quá trình bảo quản trong kho silo:
- Sự chênh lệch nhiệt độ và độ ẩm làm di cư ẩm (*moisture migration*), tạo các "điểm ẩm cục bộ" sinh mốc và độc tố vi nấm (*mycotoxins*).
- Quá trình hạt ẩm tự bốc nóng và lên men yếm khí sinh ra nhiệt và khí gas độc hại ($\text{CO}_2, \text{NH}_3$).
- Việc bật quạt thông gió thủ công nếu không tính toán độ ẩm cân bằng ($EMC$) có thể gây hút ẩm ngược, làm hỏng hạt.

Hệ thống IoT này giải quyết triệt để vấn đề trên bằng cách:
1. Thu thập liên tục 24/7 các chỉ số: Nhiệt độ ($T$), Độ ẩm không khí ($\%RH$), Nồng độ khí gas ($PPM$).
2. Tự động tính toán Độ ẩm cân bằng ($EMC - Equilibrium\ Moisture\ Content$) theo mô hình Halsey/Oswald.
3. Vận hành **Rule Engine** tự động kích hoạt quạt thông gió và còi báo động theo 3 mức rủi ro (`SAFE`, `WARNING`, `HIGH_RISK`).
4. Quản lý trọn vẹn 10 bước vòng đời thiết bị và phân quyền bảo mật chặt chẽ theo mô hình RBAC (`ADMIN`, `OPERATOR`, `VIEWER`).

---

## 2. Cấu trúc Dự án (Repository Structure)

Cấu trúc mã nguồn chuẩn theo đặc tả Mục 8.1:

```text
BTL_IOT/
├── docs/                       # Tài liệu đặc tả kỹ thuật, ngữ cảnh AI (CONTEXT.md)
├── deployment/                 # Cấu hình Docker Compose & Mosquitto Broker
│   ├── docker-compose.yml      # Container PostgreSQL và Eclipse Mosquitto
│   └── mosquitto.conf          # Cấu hình cổng MQTT (1883) và WebSocket (9001)
├── database/                   # Schema cơ sở dữ liệu & scripts
│   ├── schema.prisma           # Prisma Schema định nghĩa 7 bảng dữ liệu
│   └── seed.ts                 # Script nạp dữ liệu mẫu ban đầu (3 User, 2 Zone, 2 Device)
├── backend/                    # Mã nguồn Node.js / Express / TypeScript (Prompt 2)
├── frontend/                   # Giao diện Web React / Vite / TailwindCSS (Prompt 4)
├── tests/                      # Bộ giả lập thiết bị simulator.ts (Prompt 3)
├── firmware/                   # Mã nguồn C++ PlatformIO cho ESP32-WROOM-32
├── hardware/                   # Sơ đồ nguyên lý mạch, đấu nối chân GPIO, BOM linh kiện
├── .env.example                # Danh sách biến môi trường mẫu
├── .gitignore                  # Cấu hình bỏ qua tệp git
├── package.json                # Quản lý dependencies & scripts dự án
├── tsconfig.json               # Cấu hình TypeScript
└── README.md                   # Hướng dẫn tổng quan và khởi chạy hệ thống
```

---

## 3. Kiến trúc Hạ tầng & Giao thức

- **Database:** PostgreSQL 16 (Port `5432`) quản lý 7 bảng (`users`, `warehouse_zones`, `devices`, `telemetry_logs`, `alerts`, `device_commands`, `audit_logs`).
- **MQTT Broker:** Eclipse Mosquitto 2.0 (Port TCP `1883`, Port WebSockets `9001`).
- **Backend:** Node.js + Express + Prisma ORM + Socket.IO + MQTT.js (Port `4000`).
- **Frontend:** React + Vite + TailwindCSS + Recharts (Port `5173`).

---

## 4. Hướng dẫn Cài đặt & Khởi chạy Nhanh

### Bước 1: Sao chép biến môi trường
```bash
cp .env.example .env
```

### Bước 2: Khởi chạy Hạ tầng với Docker Compose
Khởi động cơ sở dữ liệu PostgreSQL và Mosquitto MQTT Broker:
```bash
# Khởi chạy ngầm các container
npm run docker:up

# Hoặc dùng trực tiếp lệnh docker compose:
docker compose -f deployment/docker-compose.yml up -d
```

Kiểm tra trạng thái container:
```bash
docker compose -f deployment/docker-compose.yml ps
```

### Bước 3: Cài đặt Thư viện & Sinh Prisma Client
```bash
npm install
npm run db:generate
```

### Bước 4: Khởi tạo Schema & Nạp Dữ liệu Mẫu (Seed Data)
Đẩy schema vào PostgreSQL và nạp 3 tài khoản mẫu, 2 kho silo và 2 thiết bị:
```bash
npm run db:push
npm run db:seed
```

---

## 5. Dữ liệu Mẫu Được Tạo Sẵn (Seed Accounts & Devices)

### Tài khoản Người Dùng (Passwords: `admin123` / `operator123` / `viewer123`)
| Vai trò | Email | Mật khẩu mặc định | Quyền hạn chính |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@grain.com` | `admin123` | Toàn quyền hệ thống, quản lý người dùng, quản trị thiết bị, xem audit logs |
| **OPERATOR** | `operator@grain.com` | `operator123` | Quản lý kho được gán, bật/tắt quạt, xác nhận và xử lý cảnh báo (ACK/Resolve) |
| **VIEWER** | `viewer@grain.com` | `viewer123` | Chỉ xem Dashboard, biểu đồ thời gian thực và xuất báo cáo CSV (chặn 403 lệnh điều khiển) |

### Khu vực Kho Ngũ Cốc (TCVN 8370:2018)
1. **Kho Silo Thóc Tẻ A1**: Tiêu chuẩn thóc tẻ, $MC_{target} = 14.0\%$, $RH_{max} = 65.0\%$.
2. **Kho Silo Thóc Tẻ B2**: Tiêu chuẩn thóc tẻ, $MC_{target} = 14.0\%$, $RH_{max} = 65.0\%$.

### Thiết bị Mẫu
1. **`DEV_SILO_01`**: Trạng thái `ACTIVE` (sẵn sàng nhận dữ liệu từ ESP32 hoặc Simulator).
2. **`DEV_SILO_02`**: Trạng thái `PROVISIONED` (sẵn sàng kích hoạt vào quy trình vận hành).

