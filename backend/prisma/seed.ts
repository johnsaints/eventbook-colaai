import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_PASSWORD || 'Password123!';
  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const users = [
    { name: 'Admin User', email: 'admin@eventbook.test', role: Role.ADMIN },
    { name: 'Organizer User', email: 'organizer@eventbook.test', role: Role.ORGANIZER },
    { name: 'Staff User', email: 'staff@eventbook.test', role: Role.STAFF },
    { name: 'Buyer User', email: 'buyer@eventbook.test', role: Role.BUYER },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: passwordHash, role: u.role, name: u.name },
      create: {
        name: u.name,
        email: u.email,
        password: passwordHash,
        role: u.role,
      },
    });
  }
  const organizer = await prisma.user.findUniqueOrThrow({
    where: { email: 'organizer@eventbook.test' },
    select: { id: true },
  });

  const demoEventId = '697bb20c-8669-464f-8f29-5c11513c5b78';
  const day = 86_400_000;
  const now = Date.now();
  const startsAt = new Date(now + 7 * day);
  const salesWindow = {
    salesStartsAt: new Date(now - day),
    salesEndsAt: startsAt,
  };

  await prisma.event.upsert({
    where: { id: demoEventId },
    update: {},
    create: {
      id: demoEventId,
      title: 'Encontro de Tecnologia ColaAí',
      description: 'Evento de tecnologia com palestras de arquitetura, cloud e demonstração de lotes.',
      location: 'Centro de Eventos · Fortaleza, CE',
      organizerId: organizer.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3 * 3_600_000),
      capacity: 100,
      status: 'PUBLISHED',
      lots: {
        create: [
          {
            ...salesWindow,
            name: 'Lote antecipado',
            price: 25,
            totalQuantity: 60,
          },
          {
            ...salesWindow,
            name: 'Lote interno',
            price: 40,
            totalQuantity: 20,
            active: false,
          },
          {
            ...salesWindow,
            name: 'Lote promocional',
            price: 15,
            totalQuantity: 20,
            soldQuantity: 20,
          },
        ],
      },
    },
  });

  const extraEvents = [
    {
      id: '7a1f3c20-1111-4000-8000-000000000001',
      title: 'Turnê Neon Nights — Show ao Vivo',
      description: 'Show inédito com palco 360°, efeitos visuais e participações especiais.',
      location: 'Arena Castelão · Fortaleza, CE',
      offsetDays: 12,
      durationHours: 4,
      capacity: 500,
      lots: [
        { name: 'Pista 1º Lote', price: 90, totalQuantity: 300, soldQuantity: 120 },
        { name: 'Front Stage', price: 180, totalQuantity: 150, soldQuantity: 45 },
        { name: 'Camarote Lounge', price: 320, totalQuantity: 50, soldQuantity: 50 },
      ],
    },
    {
      id: '7a1f3c20-1111-4000-8000-000000000002',
      title: 'Festival Sol & Som 2027',
      description: 'Dois dias de festival com 14 atrações nacionais, praça gastronômica e área chill.',
      location: 'Marina Park · Fortaleza, CE',
      offsetDays: 21,
      durationHours: 10,
      capacity: 1200,
      lots: [
        { name: 'Passaporte Arena', price: 140, totalQuantity: 800, soldQuantity: 210 },
        { name: 'VIP Open Vibe', price: 290, totalQuantity: 400, soldQuantity: 90 },
      ],
    },
    {
      id: '7a1f3c20-1111-4000-8000-000000000003',
      title: 'O Auto da Compadecida — Teatro',
      description: 'Montagem premiada de teatro com elenco nacional e trilha executada ao vivo.',
      location: 'Theatro José de Alencar · Fortaleza, CE',
      offsetDays: 9,
      durationHours: 2,
      capacity: 220,
      lots: [
        { name: 'Plateia Central', price: 75, totalQuantity: 140, soldQuantity: 60 },
        { name: 'Balcão Nobre', price: 50, totalQuantity: 80, soldQuantity: 15 },
      ],
    },
    {
      id: '7a1f3c20-1111-4000-8000-000000000004',
      title: 'Clássico das Multidões — Futebol',
      description: 'Grande final do campeonato estadual com torcida única por setor e acesso por pulseira.',
      location: 'Estádio Plácido Castelo · Fortaleza, CE',
      offsetDays: 5,
      durationHours: 3,
      capacity: 800,
      lots: [
        { name: 'Arquibancada Sul', price: 45, totalQuantity: 500, soldQuantity: 310 },
        { name: 'Cadeira Especial', price: 110, totalQuantity: 300, soldQuantity: 140 },
      ],
    },
    {
      id: '7a1f3c20-1111-4000-8000-000000000005',
      title: 'Noite de Stand-Up & Improviso',
      description: 'Comédia ao vivo com três humoristas convidados e interação com a plateia.',
      location: 'Teatro RioMar · Fortaleza, CE',
      offsetDays: 15,
      durationHours: 2,
      capacity: 180,
      lots: [
        { name: 'Plateia Única', price: 60, totalQuantity: 180, soldQuantity: 40 },
      ],
    },
  ];

  for (const item of extraEvents) {
    const eventStarts = new Date(now + item.offsetDays * day);
    const eventWindow = {
      salesStartsAt: new Date(now - day),
      salesEndsAt: eventStarts,
    };
    await prisma.event.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        title: item.title,
        description: item.description,
        location: item.location,
        organizerId: organizer.id,
        startsAt: eventStarts,
        endsAt: new Date(eventStarts.getTime() + item.durationHours * 3_600_000),
        capacity: item.capacity,
        status: 'PUBLISHED',
        lots: {
          create: item.lots.map(lot => ({
            ...eventWindow,
            name: lot.name,
            price: lot.price,
            totalQuantity: lot.totalQuantity,
            soldQuantity: lot.soldQuantity,
          })),
        },
      },
    });
  }

  console.log('✅ Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });