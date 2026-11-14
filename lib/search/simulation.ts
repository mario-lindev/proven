// Educational model trained only on synthetic labels. Scores do not verify claims.
export type Document = { id: string; title: string; text: string; daysOld: number };
const tokens = (text: string) => [...new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])];
export function features(query: string, document: Document): number[] {
  const q = tokens(query);
  const title = new Set(tokens(document.title));
  const body = new Set(tokens(document.text));
  const denominator = Math.max(q.length, 1);
  return [1, q.filter(t => title.has(t)).length / denominator,
    q.filter(t => body.has(t)).length / denominator, 1 / (1 + document.daysOld / 30)];
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
export function trainModel() {
  // Fixed illustrative examples: [bias, title overlap, text overlap, freshness], relevance label.
  const examples = [
    { x: [1, 1, 1, 1], y: 1 }, { x: [1, .8, .9, .7], y: 1 },
    { x: [1, .6, .8, .2], y: 1 }, { x: [1, .8, .5, .1], y: 1 },
    { x: [1, .4, .8, .9], y: 1 }, { x: [1, .7, .7, .4], y: 1 },
    { x: [1, 0, 0, 1], y: 0 }, { x: [1, .1, .1, .8], y: 0 },
    { x: [1, .2, .2, .1], y: 0 }, { x: [1, 0, .1, .4], y: 0 },
    { x: [1, .1, .3, .7], y: 0 }, { x: [1, .3, .1, .2], y: 0 },
  ];
  const weights = [0, 0, 0, 0];
  const losses: number[] = [];
  for (let epoch = 0; epoch < 800; epoch++) {
    const gradient = [0, 0, 0, 0];
    let loss = 0;
    for (const { x, y } of examples) {
      const p = sigmoid(x.reduce((sum, value, i) => sum + value * weights[i], 0));
      loss -= y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9);
      x.forEach((value, i) => gradient[i] += (p - y) * value);
    }
    weights.forEach((weight, i) => {
      weights[i] -= .3 * (gradient[i] / examples.length + (i ? .01 * weight : 0));
    });
    if (epoch === 0 || epoch === 799) losses.push(loss / examples.length);
  }
  return { weights, losses, trainingExamples: examples.length,
    score: (query: string, document: Document) => sigmoid(features(query, document).reduce((sum, x, i) => sum + x * weights[i], 0)) };
}
export const documents: Document[] = [
  { id: "a", title: "Aster Robotics funding announcement", text: "Aster Robotics announces funding for warehouse picking robots and new customer deployments.", daysOld: 5 },
  { id: "b", title: "Aster Robotics warehouse competitors", text: "Aster Robotics competes with other warehouse picking robots vendors.", daysOld: 14 },
  { id: "c", title: "Aster Academy education program", text: "Aster Academy offers education courses for students. This is a different organization.", daysOld: 2 },
  { id: "d", title: "Warehouse industry history", text: "Warehouse automation and robots adoption trends across the industry.", daysOld: 900 },
  { id: "e", title: "Aster Robotics pricing guide", text: "Aster Robotics warehouse robots pricing and vendor contract terms.", daysOld: 40 },
];
