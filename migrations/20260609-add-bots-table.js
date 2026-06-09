'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bots', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      nickname: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      roomId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'rooms', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      characterType: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: 'cat',
      },
      gender: {
        type: Sequelize.STRING(6),
        allowNull: false,
        defaultValue: 'female',
      },
      eyeColor: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: '#8E44AD',
      },
      socketId: {
        type: Sequelize.STRING(24),
        allowNull: false,
        unique: true,
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
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bots');
  },
};
