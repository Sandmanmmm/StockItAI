import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUploadFileUrl() {
  try {
    const upload = await prisma.upload.findUnique({
      where: { id: 'cmfx9q0td000355046iaobsiv' }
    });
    
    console.log('File URL:', upload?.fileUrl);
    console.log('File Name:', upload?.fileName);
    console.log('Original File Name:', upload?.originalFileName);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkUploadFileUrl();