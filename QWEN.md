# Whispering Paws Chat Backend

## Project Overview

**Whispering Paws Chat Backend** — серверная часть социальной чат-платформы с элементами ролевой игры. Построена на **NestJS 11** с использованием **TypeScript**, **PostgreSQL/Sequelize** и **Socket.IO** для WebSocket-коммуникации.

### Основные возможности

- **Аутентификация**: JWT с поддержкой гостевых аккаунтов, VK и Telegram авторизация
- **Чат реального времени**: WebSocket-чат с комнатами и личными сообщениями (DM)
- **AI-боты**: Интеграция с AI-моделями (Qwen/DashScope) для умных ботов в чате
- **Игровая экономика**: Монеты, предметы, инвентарь, экипировка, ежедневные награды
- **Платежи**: Интеграция с VK Pay и YooMoney
- **Файлы**: Загрузка и хранение изображений
- **Роли и ранги**: Система ролей (user/admin) и прогрессии рангов

### Технологический стек

| Категория | Технологии |
|-----------|------------|
| **Framework** | NestJS 11.x |
| **Язык** | TypeScript 5.7.x |
| **База данных** | PostgreSQL + Sequelize ORM |
| **WebSocket** | Socket.IO 4.x |
| **Аутентификация** | Passport + JWT |
| **Валидация** | class-validator, class-transformer |
| **AI** | DashScope API (Qwen модели) |

---

## Project Structure

```
src/
├── ai/                 # AI-сервис для ботов (интеграция с Qwen API)
├── auth/               # Аутентификация (JWT, Passport strategy)
├── bots/               # Конфигурация и управление ботами
├── chat/               # WebSocket Gateway для чата
├── common/             # Общие сервисы (online-users, rate-limit) и guards
├── config/             # Конфигурация приложения
├── daily/              # Ежедневные задания и награды
├── database/           # DB модуль, Sequelize модели, сервис
├── files/              # Загрузка и хранение файлов
├── payment/            # Платежи (VK Pay, YooMoney)
├── rooms/              # Управление комнатами чата
├── scripts/            # Скрипты (миграции БД)
├── shop/               # Магазин предметов
├── users/              # Пользовательский сервис и Gateway
├── app.module.ts       # Корневой модуль
├── main.ts             # Точка входа
└── socket-io.adapter.ts # Адаптер Socket.IO с CORS
```

### Database Models (`src/database/models/`)

| Модель | Описание |
|--------|----------|
| `user.model.ts` | Пользователи (email, nickname, coins, items, anketa) |
| `room.model.ts` | Комнаты чата |
| `chat-message.model.ts` | Сообщения в комнатах |
| `direct-message.model.ts` | Личные сообщения |
| `user-item.model.ts` | Предметы пользователя |
| `user-equipped.model.ts` | Экипированные предметы |
| `rank.model.ts` | Ранги пользователей |
| `setting.model.ts` | Настройки приложения |
| `user-daily.model.ts` | Ежедневная активность |

---

## Building and Running

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm

### Installation

```bash
npm install
```

### Environment Setup

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

| Переменная | Описание |
|------------|----------|
| `NODE_ENV` | Режим (development/production) |
| `PORT` | Порт сервера (по умолчанию 3000) |
| `HOST` | Хост (по умолчанию 0.0.0.0) |
| `DATABASE_URL` | PostgreSQL connection URI |
| `JWT_SECRET` | Секретный ключ для JWT |
| `VK_APP_SECRET` | Секрет VK App для платежей |
| `YOOMONEY_SECRET` | Секрет YooMoney для платежей |
| `TG_BOT_TOKEN` | Токен Telegram бота |
| `AI_API_KEY` | API ключ для DashScope (Qwen) |
| `AI_BASE_URL` | URL AI API (по умолчанию: DashScope) |
| `AI_MODEL` | Модель AI (по умолчанию: qwen-plus) |
| `WEB_APP_URL` | URL веб-приложения |
| `UPLOADS_DIR` | Директория для загрузок |

### Development

```bash
# Запуск в режиме разработки (watch mode)
npm run start:dev

# Запуск с отладкой
npm run start:debug

# Production сборка
npm run build
npm run start:prod
```

### Testing

```bash
# Unit тесты
npm run test

# E2E тесты
npm run test:e2e

# Покрытие кода
npm run test:cov
```

### Database Migrations

```bash
npm run db:migrate
```

### Linting & Formatting

```bash
# ESLint с автоисправлением
npm run lint

# Prettier форматирование
npm run format
```

---

## API & WebSocket Events

### REST API Endpoints

- **Auth**: `/auth/*` — регистрация, логин, гостевой вход
- **Payment**: `/payment/*` — обработка платежей (VK Pay, YooMoney)

### WebSocket Events (Socket.IO)

#### Chat Events

| Event | Direction | Payload | Описание |
|-------|-----------|---------|----------|
| `chat:message` | Client → Server | `{ text: string }` | Отправить сообщение в комнату |
| `chat:typing` | Client → Server | — | Индикатор набора текста |
| `chat:image` | Client → Server | `{ dataUrl, text }` | Отправить изображение |
| `chat:delete` | Client → Server | `{ msgId: number }` | Удалить сообщение (admin) |
| `chat:clear` | Client → Server | — | Очистить чат комнаты (admin) |
| `chat:message` | Server → Client | `{ msgId, userId, nickname, text, timestamp }` | Новое сообщение |
| `chat:deleted` | Server → Client | `{ msgId }` | Сообщение удалено |
| `chat:cleared` | Server → Client | — | Чат очищен |

#### Direct Messages (DM)

| Event | Direction | Payload | Описание |
|-------|-----------|---------|----------|
| `dm:history` | Client → Server | `{ withUserId: number }` | Запрос истории DM |
| `dm:send` | Client → Server | `{ toUserId, text }` | Отправить DM |
| `dm:sendImage` | Client → Server | `{ toUserId, dataUrl, text }` | Отправить изображение в DM |
| `dm:read` | Client → Server | — | Отметить DM как прочитанные |
| `dm:message` | Server → Client | `{ id, fromUserId, nickname, text, timestamp }` | Новое DM |
| `dm:history` | Server → Client | `{ withUserId, messages[], partnerData }` | История DM |
| `dm:unread` | Server → Client | `{ fromUserId, nickname }` | Уведомление о непрочитанном DM |

---

## Development Conventions

### Code Style

- **Prettier**: `trailingComma: "all"`, `singleQuote: false`
- **ESLint**: Строгая типизация TypeScript с предупреждениями для floating/misused promises
- **Path aliases**: Используйте `@/`, `@auth/`, `@users/`, `@chat/`, `@database/` и т.д. (см. `tsconfig.json`)

### Architecture Patterns

- **Модульность**: Каждый функциональный блок — отдельный NestJS модуль
- **Gateway Pattern**: WebSocket логика в Gateway классах с декораторами `@SubscribeMessage`
- **Guards**: JWT валидация через `WsJwtGuard` для WebSocket и HTTP
- **Services**: Бизнес-логика в сервисах, не в контроллерах/gateway
- **DTO**: Валидация входных данных через `class-validator`

### Testing Practices

- Unit тесты для сервисов с моками зависимостей
- E2E тесты для API endpoints и WebSocket событий
- Покрытие критических путей: аутентификация, платежи, сообщения

### Git Workflow

- Ветка `main` для production
- Feature ветки для новой функциональности
- Commits с понятными сообщениями (что и зачем изменено)

---

## Deployment

### Nginx Configuration

Проект включает конфигурацию Nginx (`nginx.conf`) для:

- Проксирование на порт 3000
- WebSocket поддержка (Upgrade headers)
- Статика uploads через alias
- CORS и лимиты (20M max body)

### Server Setup

1. Развернуть PostgreSQL
2. Настроить `.env` с production значениями
3. Собрать: `npm run build`
4. Запустить: `node dist/main`
5. Nginx проксирование на порт 5001 для фронтенда

---

## Key Services

### OnlineUsersService (`src/common/services/`)

Трекинг онлайн-пользователей: кто в какой комнате, статус, сокеты.

### RateLimitService (`src/common/services/`)

Ограничение частоты WebSocket событий (спам-защита).

### AiService (`src/ai/`)

- Буферизация сообщений комнаты (15 последних)
- Cooldown между ответами бота (8 сек)
- Реакция на упоминания и случайные триггеры (4% шанс)
- Интеграция с DashScope API (Qwen модели)

### BotsService (`src/bots/`)

Управление ботами в комнатах, проверка присутствия ботов.

### DatabaseService (`src/database/`)

Абстракция над Sequelize для операций:
- Сохранение/получение сообщений
- Прямые сообщения (DM)
- Счётчики ежедневной активности
- Управление предметами и экипировкой
- Ежедневные квесты и streak-система

---

## Security Notes

- JWT токены: 30 дней для пользователей, 7 дней для гостей
- Rate limiting на WebSocket событиях
- CORS настроен для VK Apps и production домена
- Пароли хешируются через bcryptjs
- `forbidNonWhitelisted` в валидации для защиты от лишних полей
- Глобальная валидация с `transform: true` и `whitelist: true`
