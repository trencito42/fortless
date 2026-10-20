import { Hero } from '../home/Hero';
import { Ticker } from '../home/Ticker';
import { Story } from '../home/Story';
import { Services } from '../home/Services';
import { Platform } from '../home/Platform';
import { Trust } from '../home/Trust';
import { Direction } from '../home/Direction';
import { Faq } from '../home/Faq';
import { FinalCta } from '../home/FinalCta';

export default function Home() {
  return (
    <>
      <Hero />
      <Ticker />
      <Story />
      <Services />
      <Platform />
      <Trust />
      <Direction />
      <Faq />
      <FinalCta />
    </>
  );
}
