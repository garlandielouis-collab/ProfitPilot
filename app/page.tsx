'use client';

import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { TrustBar } from '../components/landing/TrustBar';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { TestimonialsSection } from '../components/landing/TestimonialsSection';
import { CTASection } from '../components/landing/CTASection';
import { Footer } from '../components/landing/Footer';
import { PilotAIChatbot } from '../components/landing/PilotAIChatbot';

export default function HomePage() {
  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{ background: '#0B0F19', color: '#f1f5f9' }}
    >
      <Navbar />
      <Hero />
      <TrustBar />
      <FeaturesSection />
      <TestimonialsSection />
      <CTASection />
      <Footer />
      <PilotAIChatbot />
    </div>
  );
}
