const fs = require('fs');
const path = require('path');
const { parse } = require('url');

// Загружаем .env файл
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value !== undefined) {
      process.env[key.trim()] = value.trim();
    }
  });
}

// Парсим DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
let dbConfig = {
  username: 'postgres',
  password: 'postgres',
  database: 'whispering_paws',
  host: 'localhost',
  port: 5432,
};

if (databaseUrl) {
  try {
    // Формат: postgresql://user:password@host:port/database?schema=public
    const match = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?\/([^?]+)/);
    if (match) {
      dbConfig = {
        username: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4] || '5432', 10),
        database: match[5].split('?')[0],
      };
    }
  } catch (e) {
    console.error('Failed to parse DATABASE_URL:', e.message);
  }
}

module.exports = {
  development: {
    ...dbConfig,
    dialect: 'postgres',
    logging: false,
  },
  test: {
    ...dbConfig,
    database: dbConfig.database + '_test',
    dialect: 'postgres',
    logging: false,
  },
  production: {
    ...dbConfig,
    dialect: 'postgres',
    logging: false,
  },
};
