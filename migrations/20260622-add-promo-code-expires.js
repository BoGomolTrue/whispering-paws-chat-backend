'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('promo_codes', 'expiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addIndex('promo_codes', ['expiresAt']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('promo_codes', ['expiresAt']);
    await queryInterface.removeColumn('promo_codes', 'expiresAt');
  },
};
