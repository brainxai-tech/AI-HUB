import { Check } from "lucide-react";

const stages = ["触景", "起稿", "照律", "炼字", "成笺"];

export function PoetryPulse({ activeStage }: { activeStage: number }) {
  return (
    <nav className="poetry-pulse" aria-label="创作进度">
      <span className="pulse-title">诗脉</span>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage} className={index <= activeStage ? "active" : ""} aria-current={index === activeStage ? "step" : undefined}>
            <span>{index < activeStage ? <Check size={10} aria-hidden="true" /> : index + 1}</span><b>{stage}</b>
          </li>
        ))}
      </ol>
    </nav>
  );
}
