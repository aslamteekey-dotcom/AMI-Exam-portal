import React, { useEffect, useState } from 'react';
import { Home, Award, CalendarCheck, CreditCard, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface PWABottomNavProps {
  role: 'parent' | 'teacher';
  activeTab: string;
  onSelectTab: (tabId: string) => void;
}

interface NavItem {
  id: string;
  labelEn: string;
  labelMl: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const PWABottomNav: React.FC<PWABottomNavProps> = ({
  role,
  activeTab,
  onSelectTab,
}) => {
  const { lang } = useAuth();
  const isMl = lang === 'ml';

  // Support iOS Safari standalone mode where display-mode: standalone might need a helper check
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const matchDisplay = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone =
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(matchDisplay || isIOSStandalone);
    };

    checkStandalone();
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', checkStandalone);
    return () => media.removeEventListener?.('change', checkStandalone);
  }, []);

  const parentItems: NavItem[] = [
    {
      id: 'home',
      labelEn: 'Home',
      labelMl: 'ഹോം',
      icon: Home,
    },
    {
      id: 'report',
      labelEn: 'Result',
      labelMl: 'റിസൾട്ട്',
      icon: Award,
    },
    {
      id: 'attendance',
      labelEn: 'Attendance',
      labelMl: 'ഹാജർ',
      icon: CalendarCheck,
    },
    {
      id: 'fees',
      labelEn: 'Fees',
      labelMl: 'ഫീസ്',
      icon: CreditCard,
    },
  ];

  const teacherItems: NavItem[] = [
    {
      id: 'home',
      labelEn: 'Home',
      labelMl: 'ഹോം',
      icon: Home,
    },
    {
      id: 'my_class',
      labelEn: 'My Class',
      labelMl: 'ക്ലാസ്',
      icon: Users,
    },
    {
      id: 'attendance',
      labelEn: 'Attendance',
      labelMl: 'ഹാജർ',
      icon: CalendarCheck,
    },
    {
      id: 'fees',
      labelEn: 'Fees',
      labelMl: 'ഫീസ്',
      icon: CreditCard,
    },
  ];

  const items = role === 'parent' ? parentItems : teacherItems;

  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    // Smooth scroll to top of scrollable root container
    try {
      const rootEl = document.getElementById('root');
      if (rootEl) {
        rootEl.scrollTo({ top: 0, behavior: 'smooth' });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
  };

  return (
    <nav
      aria-label="Mobile PWA Navigation"
      className={`pwa-bottom-nav fixed bottom-0 left-0 right-0 shrink-0 w-full z-50 bg-white/90 backdrop-blur-md border-t border-slate-200/80 shadow-md select-none print:hidden items-center justify-around px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] ${
        isStandalone ? 'max-md:flex' : ''
      }`}
    >
      <div className="grid grid-cols-4 w-full max-w-md mx-auto">
        {items.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const label = isMl ? item.labelMl : item.labelEn;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabClick(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 transition-colors duration-150 active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-[#047857]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'scale-110 stroke-[2.5]' : 'stroke-[1.75]'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] mt-1 font-semibold leading-none truncate max-w-[75px] ${
                  isActive ? 'text-[#047857] font-bold' : 'text-gray-500'
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
