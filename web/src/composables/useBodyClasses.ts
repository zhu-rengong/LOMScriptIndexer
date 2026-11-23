export const useBodyClasses = (): void => {
  const view = useViewStore();
  watchEffect(() => {
    document.body.classList.toggle("rail-open", view.railOpen);
    document.body.classList.toggle("search-open", view.searchOpen);
    document.body.classList.toggle("chrome-hidden", view.chromeHidden);
  });
};
