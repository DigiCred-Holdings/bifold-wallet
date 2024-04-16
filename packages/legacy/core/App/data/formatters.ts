export const formatDate = (date: Date): string => {
  return (
    (date.getMonth() + 1).toString().padStart(2, '0') +
    '/' +
    date.getDate().toString().padStart(2, '0') +
    '/' +
    date.getFullYear()
  );
};
