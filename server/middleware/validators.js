const { body, validationResult } = require('express-validator');

// Validation rules for event creation
const eventValidationRules = [
  body('service')
    .trim()
    .notEmpty()
    .withMessage('Service name is required')
    .isString()
    .withMessage('Service must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Service name must be between 1 and 100 characters'),

  body('severity')
    .notEmpty()
    .withMessage('Severity is required')
    .isInt({ min: 1, max: 5 })
    .withMessage('Severity must be an integer between 1 and 5'),

  body('metadata')
    .notEmpty()
    .withMessage('Metadata is required')
    .isObject()
    .withMessage('Metadata must be an object'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),

  body('tags.*')
    .optional()
    .isString()
    .withMessage('Each tag must be a string'),

  body('rawPayload')
    .optional()
];

// Middleware to check validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }

  next();
};

module.exports = {
  eventValidationRules,
  validate
};
