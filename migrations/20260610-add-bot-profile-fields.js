'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bots', 'status', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: '',
    });
    await queryInterface.addColumn('bots', 'coins', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 100,
    });
    await queryInterface.addColumn('bots', 'inventoryValue', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('bots', 'badges', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.addColumn('bots', 'ownedItems', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.addColumn('bots', 'equipped', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: {},
    });
    await queryInterface.addColumn('bots', 'anketa_about', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('bots', 'anketa_city', {
      type: Sequelize.STRING(80),
      allowNull: true,
    });
    await queryInterface.addColumn('bots', 'anketa_interests', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('bots', 'anketa_age', {
      type: Sequelize.STRING(10),
      allowNull: true,
    });
    await queryInterface.addColumn('bots', 'anketa_looking_for', {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
    await queryInterface.addColumn('bots', 'statusPool', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: ['', 'тут', 'скучно', 'brb'],
    });
  },

  async down(queryInterface) {
    const cols = [
      'status',
      'coins',
      'inventoryValue',
      'badges',
      'ownedItems',
      'equipped',
      'anketa_about',
      'anketa_city',
      'anketa_interests',
      'anketa_age',
      'anketa_looking_for',
      'statusPool',
    ];
    for (const col of cols) {
      await queryInterface.removeColumn('bots', col);
    }
  },
};
