'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('profile_post_comments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      postId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'profile_posts', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
    await queryInterface.addIndex('profile_post_comments', ['postId', 'createdAt'], {
      name: 'profile_post_comments_post_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('profile_post_comments');
  },
};
