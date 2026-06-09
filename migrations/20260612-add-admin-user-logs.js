'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_logs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      adminId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      adminNickname: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      action: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      targetUserId: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      details: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('admin_logs', ['createdAt']);
    await queryInterface.addIndex('admin_logs', ['adminId']);

    await queryInterface.createTable('user_logs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      message: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      meta: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('user_logs', ['userId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_logs');
    await queryInterface.dropTable('admin_logs');
  },
};
