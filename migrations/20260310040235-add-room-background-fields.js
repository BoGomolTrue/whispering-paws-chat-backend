'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('rooms', 'backgroundType', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'grass',
    });

    await queryInterface.addColumn('rooms', 'weather', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'clear',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('rooms', 'backgroundType');
    await queryInterface.removeColumn('rooms', 'weather');
  },
};
