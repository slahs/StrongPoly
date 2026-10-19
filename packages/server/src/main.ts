import { startServer } from './index';

const PORT = Number(process.env.PORT ?? 3000);
const s = startServer(PORT);
console.log(`StrongPoly-Server läuft auf Port ${s.port}`);

process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
