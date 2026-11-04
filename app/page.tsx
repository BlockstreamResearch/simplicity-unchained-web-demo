import { Header } from '@/components/Header';
import { DemoWorkspace } from '@/components/DemoWorkspace';
import { Notification } from '@/components/Notification';
import { WarningModal } from '@/components/WarningModal';
import { AppProvider } from '@/contexts/AppContext';

export default function Home() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-white text-ink">
        <WarningModal />
        <Header />
        <Notification />

        <DemoWorkspace />
      </div>
    </AppProvider>
  );
}
