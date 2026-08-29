export const getApiErrorMessage = (
  error,
  fallback = 'လုပ်ဆောင်မှု မအောင်မြင်ပါ။',
) => {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          const location = Array.isArray(item.loc)
            ? item.loc
                .filter((part) => part !== 'body')
                .join(' → ')
            : '';

          const message =
            item.msg ||
            item.message ||
            'အချက်အလက် မမှန်ကန်ပါ။';

          return location
            ? `${location}: ${message}`
            : message;
        }

        return String(item);
      })
      .join(' • ');
  }

  if (detail && typeof detail === 'object') {
    return (
      detail.message ||
      detail.msg ||
      JSON.stringify(detail)
    );
  }

  return error?.message || fallback;
};