import { createContext, useContext } from "react";

const ApplicationUserContext = createContext(null);

export const ApplicationUserProvider = ApplicationUserContext.Provider;

// This hook intentionally lives beside its context to keep auth state centralized.
// eslint-disable-next-line react-refresh/only-export-components
export const useApplicationUser = () => useContext(ApplicationUserContext);
