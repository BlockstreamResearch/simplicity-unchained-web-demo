import { Header } from '@/components/Header';
import { SimplicityProgram } from '@/components/SimplicityProgram';
import { BitcoinScript } from '@/components/BitcoinScript';
import { SendTransaction } from '@/components/SendTransaction';
import { Logs } from '@/components/Logs';
import { Notification } from '@/components/Notification';
import { InfoMenu } from '@/components/InfoMenu';
import { WarningModal } from '@/components/WarningModal';
import { AppProvider } from '@/contexts/AppContext';

export default function Home() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <WarningModal />
        <Header />
        <Notification />

        <main className="mx-auto max-w-7xl px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Code Forms */}
            <div className="lg:col-span-2 space-y-8">
              <SimplicityProgram />
              <BitcoinScript />
            </div>

            {/* Right Column - Transaction Form and Logs */}
            <div className="lg:col-span-1 space-y-8">
              <SendTransaction />
              <Logs />
            </div>
          </div>
        </main>
      </div>
    </AppProvider>
  );
}
