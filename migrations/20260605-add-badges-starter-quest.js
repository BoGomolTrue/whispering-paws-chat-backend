"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "badges", {
      type: Sequelize.JSON,
      allowNull: false,
      defaultValue: [],
    });
    await queryInterface.addColumn("users", "starterQuestStep", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "starterQuestStep");
    await queryInterface.removeColumn("users", "badges");
  },
};
