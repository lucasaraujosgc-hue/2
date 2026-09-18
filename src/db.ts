import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Certifique-se de que o diretório data exista
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// O arquivo .db ficará em /data/database.db
const dbPath = path.join(dataDir, 'database.db');
export const db = new Database(dbPath, { verbose: console.log });

// Habilitar o modo WAL (Write-Ahead Logging) para melhor performance
db.pragma('journal_mode = WAL');

// Inicialização de tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS frequencia (
    id TEXT PRIMARY KEY,
    escola TEXT,
    porcentagem REAL,
    semana TEXT,
    tipo TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS escola_matriculas (
    escola TEXT,
    tipo TEXT,
    matriculados INTEGER DEFAULT 0,
    PRIMARY KEY (escola, tipo)
  );
`);

try {
  db.exec(`ALTER TABLE frequencia ADD COLUMN matriculados INTEGER DEFAULT NULL;`);
} catch {
  // Ignora se a coluna já existir
}
