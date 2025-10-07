const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createStockupSupplier() {
  try {
    // Get the merchant ID
    const merchant = await prisma.merchant.findFirst();
    if (!merchant) {
      throw new Error('No merchant found');
    }

    console.log('Creating Stockup Market Inc. supplier...\n');

    const supplier = await prisma.supplier.create({
      data: {
        name: 'Stockup Market Inc.',
        contactEmail: 'samuelk@stockupmarket.com',
        contactPhone: '(855) 994-3338',
        address: '600 Clayson Road, North York, Ontario, Canada, M9M 2H2',
        status: 'active',
        merchantId: merchant.id,
        syncEnabled: false,
      },
    });

    console.log('✅ Created supplier:');
    console.log(`   ID: ${supplier.id}`);
    console.log(`   Name: ${supplier.name}`);
    console.log(`   Email: ${supplier.contactEmail}`);
    console.log(`   Phone: ${supplier.contactPhone}`);
    console.log(`   Address: ${supplier.address}`);

    // Now let's link the Stockup Market POs
    const unlinkStockupPOs = await prisma.purchaseOrder.findMany({
      where: {
        supplierId: null,
        supplierName: 'Stockup Market Inc.',
      },
    });

    console.log(`\n📦 Found ${unlinkStockupPOs.length} unlinked Stockup Market Inc. POs`);

    if (unlinkStockupPOs.length > 0) {
      const result = await prisma.purchaseOrder.updateMany({
        where: {
          supplierId: null,
          supplierName: 'Stockup Market Inc.',
        },
        data: {
          supplierId: supplier.id,
        },
      });

      console.log(`✅ Linked ${result.count} POs to Stockup Market Inc.`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createStockupSupplier();
