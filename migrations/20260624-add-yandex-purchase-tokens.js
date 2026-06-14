'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('yandex_purchase_tokens', {
      token: {
        type: Sequelize.STRING(128),
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      productId: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('yandex_purchase_tokens', ['userId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('yandex_purchase_tokens');
  },
};
