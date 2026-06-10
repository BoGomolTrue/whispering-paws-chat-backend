'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promo_codes', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        unique: true,
      },
      coins: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      createdByAdminId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('promo_codes', ['createdAt']);

    await queryInterface.createTable('promo_code_redemptions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      promoCodeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'promo_codes', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('promo_code_redemptions', ['promoCodeId', 'userId'], {
      unique: true,
      name: 'promo_code_redemptions_promo_user_unique',
    });
    await queryInterface.addIndex('promo_code_redemptions', ['userId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('promo_code_redemptions');
    await queryInterface.dropTable('promo_codes');
  },
};
