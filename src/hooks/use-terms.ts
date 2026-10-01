"use client";

import { createContext, useContext } from "react";
import { PLAIN_TERMS, type Terms } from "@/lib/terms";

export const TermsContext = createContext<Terms>(PLAIN_TERMS);
export const useTerms = () => useContext(TermsContext);
