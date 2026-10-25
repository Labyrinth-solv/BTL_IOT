import { PrismaClient, Role, UserStatus, LifecycleState } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Bắt đầu khởi tạo dữ liệu mẫu (Seeding database)...');

  // ---------------------------------------------------------------------------
  // 1. TẠO 3 TÀI KHOẢN NGƯỜI DÙNG (ADMIN, OPERATOR, VIEWER)
  // ---------------------------------------------------------------------------
  console.log('👤 Đang tạo tài khoản người dùng...');

  const saltRounds = 10;
  const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
  const operatorPasswordHash = await bcrypt.hash('operator123', saltRounds);
  const viewerPasswordHash = await bcrypt.hash('viewer123', saltRounds);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@grain.com' },
    update: {
      password_hash: adminPasswordHash,
      full_name: 'Quản Trị Viên Hệ Thống (Admin)',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'admin@grain.com',
      password_hash: adminPasswordHash,
      full_name: 'Quản Trị Viên Hệ Thống (Admin)',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      telegram_chat_id: '123456789',
    },
  });

  const operatorUser = await prisma.user.upsert({
    where: { email: 'operator@grain.com' },
    update: {
      password_hash: operatorPasswordHash,
      full_name: 'Thủ Kho Vận Hành (Operator)',
      role: Role.OPERATOR,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'operator@grain.com',
      password_hash: operatorPasswordHash,
      full_name: 'Thủ Kho Vận Hành (Operator)',
      role: Role.OPERATOR,
      status: UserStatus.ACTIVE,
      telegram_chat_id: '987654321',
    },
  });

  const viewerUser = await prisma.user.upsert({
    where: { email: 'viewer@grain.com' },
    update: {
      password_hash: viewerPasswordHash,
      full_name: 'Kiểm Định Viên Chất Lượng (Viewer)',
      role: Role.VIEWER,
      status: UserStatus.ACTIVE,
    },
    create: {
      email: 'viewer@grain.com',
      password_hash: viewerPasswordHash,
      full_name: 'Kiểm Định Viên Chất Lượng (Viewer)',
      role: Role.VIEWER,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(`✅ Đã tạo 3 người dùng:
   - Admin: ${adminUser.email} (Mật khẩu: admin123)
   - Operator: ${operatorUser.email} (Mật khẩu: operator123)
   - Viewer: ${viewerUser.email} (Mật khẩu: viewer123)`);

  // ---------------------------------------------------------------------------
  // 2. TẠO 2 KHU VỰC KHO THÓC TẺ THEO TIÊU CHUẨN TCVN 8370:2018
  // ---------------------------------------------------------------------------
  console.log('🏭 Đang tạo 2 khu vực kho theo tiêu chuẩn TCVN 8370:2018...');

  // Kho Silo A1
  const existingZoneA1 = await prisma.warehouseZone.findFirst({
    where: { name: 'Kho Silo Thóc Tẻ A1 - TCVN 8370:2018' },
  });

  const zoneA1 = existingZoneA1
    ? await prisma.warehouseZone.update({
        where: { id: existingZoneA1.id },
        data: {
          grain_type: 'Thóc tẻ - TCVN 8370',
          target_mc: 14.0, // Độ ẩm hạt tối đa an toàn 14.0%
          max_rh: 65.0,    // Độ ẩm không khí giới hạn 65.0%
          manager_id: operatorUser.id,
        },
      })
    : await prisma.warehouseZone.create({
        data: {
          name: 'Kho Silo Thóc Tẻ A1 - TCVN 8370:2018',
          grain_type: 'Thóc tẻ - TCVN 8370',
          target_mc: 14.0,
          max_rh: 65.0,
          manager_id: operatorUser.id,
        },
      });

  // Kho Silo B2
  const existingZoneB2 = await prisma.warehouseZone.findFirst({
    where: { name: 'Kho Silo Thóc Tẻ B2 - TCVN 8370:2018' },
  });

  const zoneB2 = existingZoneB2
    ? await prisma.warehouseZone.update({
        where: { id: existingZoneB2.id },
        data: {
          grain_type: 'Thóc tẻ - TCVN 8370',
          target_mc: 14.0,
          max_rh: 65.0,
          manager_id: operatorUser.id,
        },
      })
    : await prisma.warehouseZone.create({
        data: {
          name: 'Kho Silo Thóc Tẻ B2 - TCVN 8370:2018',
          grain_type: 'Thóc tẻ - TCVN 8370',
          target_mc: 14.0,
          max_rh: 65.0,
          manager_id: operatorUser.id,
        },
      });

  console.log(`✅ Đã tạo 2 khu vực kho:
   - Zone 1: ${zoneA1.name} (ID: ${zoneA1.id})
   - Zone 2: ${zoneB2.name} (ID: ${zoneB2.id})`);

  // ---------------------------------------------------------------------------
  // 3. TẠO 2 THIẾT BỊ MẪU (DEV_SILO_01: ACTIVE, DEV_SILO_02: PROVISIONED)
  // ---------------------------------------------------------------------------
  console.log('📡 Đang tạo 2 thiết bị mẫu...');

  const tokenDev01Hash = await bcrypt.hash('secret_token_dev_silo_01', saltRounds);
  const tokenDev02Hash = await bcrypt.hash('secret_token_dev_silo_02', saltRounds);

  const defaultDevConfig = {
    sampling_interval_ms: 3000,
    temp_warn_threshold: 25.0,
    temp_crit_threshold: 28.0,
    hum_warn_threshold: 65.0,
    hum_crit_threshold: 70.0,
    gas_warn_threshold: 600.0,
    gas_crit_threshold: 700.0,
    emc_warn_threshold: 14.0,
    emc_crit_threshold: 14.8,
  };

  const dev01 = await prisma.device.upsert({
    where: { device_code: 'DEV_SILO_01' },
    update: {
      name: 'Thiết Bị Cảm Biến & Quạt Kho Silo A1',
      zone_id: zoneA1.id,
      lifecycle_state: LifecycleState.ACTIVE,
      is_online: false,
      fw_version: '1.0.2',
      hw_version: 'ESP32-WROOM-32-v1',
      config_json: defaultDevConfig,
    },
    create: {
      device_code: 'DEV_SILO_01',
      name: 'Thiết Bị Cảm Biến & Quạt Kho Silo A1',
      secret_token_hash: tokenDev01Hash,
      zone_id: zoneA1.id,
      lifecycle_state: LifecycleState.ACTIVE,
      is_online: false,
      fw_version: '1.0.2',
      hw_version: 'ESP32-WROOM-32-v1',
      config_json: defaultDevConfig,
    },
  });

  const dev02 = await prisma.device.upsert({
    where: { device_code: 'DEV_SILO_02' },
    update: {
      name: 'Thiết Bị Cảm Biến & Quạt Kho Silo B2',
      zone_id: zoneB2.id,
      lifecycle_state: LifecycleState.PROVISIONED,
      is_online: false,
      fw_version: '1.0.0',
      hw_version: 'ESP32-WROOM-32-v1',
      config_json: { ...defaultDevConfig, sampling_interval_ms: 5000 },
    },
    create: {
      device_code: 'DEV_SILO_02',
      name: 'Thiết Bị Cảm Biến & Quạt Kho Silo B2',
      secret_token_hash: tokenDev02Hash,
      zone_id: zoneB2.id,
      lifecycle_state: LifecycleState.PROVISIONED,
      is_online: false,
      fw_version: '1.0.0',
      hw_version: 'ESP32-WROOM-32-v1',
      config_json: { ...defaultDevConfig, sampling_interval_ms: 5000 },
    },
  });

  console.log(`✅ Đã tạo 2 thiết bị mẫu:
   - Thiết bị 1: ${dev01.device_code} (${dev01.name}) - Trạng thái: ${dev01.lifecycle_state}
   - Thiết bị 2: ${dev02.device_code} (${dev02.name}) - Trạng thái: ${dev02.lifecycle_state}`);

  // ---------------------------------------------------------------------------
  // 4. GHI NHẬT KÝ KHỞI TẠO HỆ THỐNG VÀO AUDIT LOG
  // ---------------------------------------------------------------------------
  await prisma.auditLog.create({
    data: {
      actor_id: adminUser.id,
      action: 'SYSTEM_INITIALIZATION',
      target_type: 'SYSTEM',
      target_id: 'SYSTEM_ROOT',
      ip_address: '127.0.0.1',
      details_json: {
        description: 'Khởi tạo dữ liệu cơ sở ban đầu theo đặc tả TCVN 8370:2018',
        seeded_users: ['admin@grain.com', 'operator@grain.com', 'viewer@grain.com'],
        seeded_zones: [zoneA1.name, zoneB2.name],
        seeded_devices: ['DEV_SILO_01 (ACTIVE)', 'DEV_SILO_02 (PROVISIONED)'],
      },
    },
  });

  console.log('✅ Đã lưu bản ghi nhật ký kiểm toán (Audit Log) cho khởi tạo hệ thống.');
  console.log('🎉 Hoàn tất nạp dữ liệu mẫu (Database seeded successfully)!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

