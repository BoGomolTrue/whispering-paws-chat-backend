'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('users', 'referralCode', {
      type: Sequelize.STRING(10),
      unique: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('users', 'referredBy', {
      type: Sequelize.INTEGER,
      defaultValue: null,
    });
    await queryInterface.addColumn('users', 'referralBonusPaid', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('users', 'referralCode');
    await queryInterface.removeColumn('users', 'referredBy');
    await queryInterface.removeColumn('users', 'referralBonusPaid');
  },
};
