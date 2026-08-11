import { useState } from 'react';

export const useFormValidation = (initialState, validationRules) => {
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues({ ...values, [name]: value });

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched({ ...touched, [name]: true });

    // Validate on blur
    if (validationRules[name]) {
      const error = validationRules[name](values[name]);
      setErrors({ ...errors, [name]: error });
    }
  };

  const validate = () => {
    const newErrors = {};
    let isValid = true;

    Object.keys(validationRules).forEach(key => {
      const error = validationRules[key](values[key]);
      if (error) {
        newErrors[key] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched(
      Object.keys(values).reduce((acc, key) => ({ ...acc, [key]: true }), {})
    );

    return isValid;
  };

  const reset = () => {
    setValues(initialState);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate,
    reset,
    setValues,
  };
};