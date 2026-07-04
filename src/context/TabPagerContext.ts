import { createContext, useContext } from 'react';

interface TabPagerCtx {
  goToHome: () => void;
  goToRecord: () => void;
  goToSettings: () => void;
  setHomeAtEdge: (atEdge: boolean) => void;
}

export const TabPagerContext = createContext<TabPagerCtx>({
  goToHome: () => {},
  goToRecord: () => {},
  goToSettings: () => {},
  setHomeAtEdge: () => {},
});

export const useTabPager = () => useContext(TabPagerContext);
