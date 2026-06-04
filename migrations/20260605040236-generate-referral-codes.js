'use strict';

const crypto = require('crypto');

function generateReferralCode() {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const users = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE "referralCode" IS NULL',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    for (const user of users) {
      let code = generateReferralCode();
      let attempts = 0;
      const maxAttempts = 100;

      while (attempts < maxAttempts) {
        const existing = await queryInterface.sequelize.query(
          'SELECT id FROM users WHERE "referralCode" = ?',
          { replacements: [code], type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (existing.length === 0) {
          break;
        }
        code = generateReferralCode();
        attempts++;
      }

      if (attempts < maxAttempts) {
        await queryInterface.sequelize.query(
          'UPDATE users SET "referralCode" = ? WHERE id = ?',
          { replacements: [code, user.id] }
        );
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'UPDATE users SET "referralCode" = NULL'
    );
  },
};
