// `?user=` picks who you are in this tab.
export const userId = new URLSearchParams(location.search).get("user") ?? "me";
