import React from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { BentoGrid } from './components/BentoGrid';
import { HowItWorks } from './components/HowItWorks';
import { InstallGuide } from './components/InstallGuide';
import { TechStack } from './components/TechStack';
import { Faq } from './components/Faq';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#07090e] text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      <Navbar />
      <main className="flex-grow">
        <Hero />
        <BentoGrid />
        <HowItWorks />
        <InstallGuide />
        <TechStack />
        <Faq />
      </main>
      <Footer />
    </div>
  );
};

export default App;
