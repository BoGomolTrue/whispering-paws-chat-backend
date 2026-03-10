# Миграции базы данных

В проекте используется `sequelize-cli` для управления миграциями базы данных.

## Команды

### Запуск всех_pending миграций
```bash
npm run db:migrate
```

### Откат последней миграции
```bash
npm run db:migrate:undo
```

### Откат всех миграций
```bash
npm run db:migrate:undo:all
```

### Создание новой миграции
```bash
npm run db:migrate:generate <name>
```

Пример:
```bash
npm run db:migrate:generate add-user-avatar
```

## Структура миграции

Файлы миграций находятся в папке `migrations/`.

Пример миграции:

```javascript
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Добавление новой колонки
    await queryInterface.addColumn('users', 'avatar', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Откат миграции (удаление колонки)
    await queryInterface.removeColumn('users', 'avatar');
  },
};
```

## Примеры операций

### Добавить колонку
```javascript
await queryInterface.addColumn('table_name', 'column_name', {
  type: Sequelize.STRING(50),
  allowNull: false,
  defaultValue: 'default_value',
});
```

### Удалить колонку
```javascript
await queryInterface.removeColumn('table_name', 'column_name');
```

### Изменить тип колонки
```javascript
await queryInterface.changeColumn('table_name', 'column_name', {
  type: Sequelize.TEXT,
  allowNull: true,
});
```

### Переименовать колонку
```javascript
await queryInterface.renameColumn('table_name', 'old_name', 'new_name');
```

### Создать таблицу
```javascript
await queryInterface.createTable('table_name', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: Sequelize.STRING(50),
    allowNull: false,
  },
  createdAt: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  updatedAt: {
    type: Sequelize.DATE,
    allowNull: false,
  },
});
```

### Удалить таблицу
```javascript
await queryInterface.dropTable('table_name');
```

## Конфигурация

Конфигурация базы данных находится в `config/config.js` и использует `DATABASE_URL` из `.env` файла.

Формат `DATABASE_URL`:
```
postgresql://username:password@host:port/database_name
```

Пример `.env`:
```env
DATABASE_URL=postgresql://postgres:root@localhost:5432/whispering_paws?schema=public
```
