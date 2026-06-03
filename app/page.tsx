'use client';

import { Navbar }              from '../components/landing/Navbar';
import { Hero }                from '../components/landing/Hero';
import { TrustBar }            from '../components/landing/TrustBar';
import { ProblemSection }      from '../components/landing/ProblemSection';
import { FeaturesSection }     from '../components/landing/FeaturesSection';
import { PilotAISection }      from '../components/landing/PilotAISection';
import { TestimonialsSection } from '../components/landing/TestimonialsSection';
import { HowItWorks }          from '../components/landing/HowItWorks';
import { CTASection }          from '../components/landing/CTASection';
import { Footer }              from '../components/landing/Footer';
import { PilotAIChatbot }      from '../components/landing/PilotAIChatbot';

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#001f3f]">
      <Navbar />
      <Hero />
      <TrustBar />
      <ProblemSection />
      <FeaturesSection />
      <PilotAISection />
      <TestimonialsSection />
      <HowItWorks />
      <CTASection />
      <Footer />
      <PilotAIChatbot />
    </div>
  );
}
