// Answer key for the self-improve loop: short claims about well-known public companies, settled before 2026.
// Fixed split: Proven practises on `train` and is tested on `test`, which the improver never sees.
export type BenchClaim = { claim: string; key: boolean; why: string; split: "train" | "test" };

export const BENCHMARK: BenchClaim[] = [
  { split: "train", key: true, claim: "Microsoft acquired LinkedIn in 2016.", why: "Announced June 2016, closed December 2016 for about $26B." },
  { split: "train", key: true, claim: "Stripe was founded by Patrick and John Collison.", why: "The Collison brothers founded Stripe in 2010." },
  { split: "train", key: true, claim: "Figma went public on the NYSE in 2025.", why: "Figma listed on the NYSE as FIG in July 2025." },
  { split: "train", key: true, claim: "Google acquired YouTube in 2006.", why: "Bought for $1.65B in stock in 2006." },
  { split: "train", key: true, claim: "Salesforce acquired Slack.", why: "The $27.7B deal closed in July 2021." },
  { split: "train", key: false, claim: "Adobe completed its acquisition of Figma.", why: "The deal was abandoned in December 2023." },
  { split: "train", key: false, claim: "Tesla was founded by Elon Musk in 1999.", why: "Founded in 2003 by Martin Eberhard and Marc Tarpenning." },
  { split: "train", key: false, claim: "Airbnb has never been a publicly traded company.", why: "Airbnb listed on Nasdaq in December 2020." },
  { split: "train", key: false, claim: "Nvidia completed its acquisition of Arm.", why: "The deal was called off in February 2022." },
  { split: "train", key: false, claim: "Netflix was founded in 2007 as a streaming company.", why: "Founded in 1997 as a DVD-by-mail service." },
  { split: "test", key: true, claim: "Facebook acquired Instagram in 2012.", why: "Bought for about $1B in April 2012." },
  { split: "test", key: true, claim: "Amazon acquired Whole Foods in 2017.", why: "The $13.7B deal closed in August 2017." },
  { split: "test", key: true, claim: "Spotify went public through a direct listing on the NYSE in 2018.", why: "Direct listing in April 2018." },
  { split: "test", key: false, claim: "Microsoft acquired Zoom Video Communications.", why: "Zoom is an independent public company." },
  { split: "test", key: false, claim: "Uber is still a privately held company.", why: "Uber listed on the NYSE in May 2019." },
  { split: "test", key: false, claim: "Shopify is headquartered in San Francisco.", why: "Shopify is based in Ottawa, Canada." },
];

// Names the improver may not write into a strategy (that would be memorising the answer key).
export const BENCH_NAMES = [
  "microsoft", "linkedin", "stripe", "collison", "figma", "google", "youtube", "salesforce", "slack", "adobe", "tesla", "musk",
  "airbnb", "nvidia", "netflix", "facebook", "instagram", "amazon", "whole foods", "spotify", "zoom", "uber", "shopify",
];
