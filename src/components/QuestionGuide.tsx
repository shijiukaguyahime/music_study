import { Lightbulb } from "lucide-react";
import { MODE_CONTENT } from "@/lib/learning";
import type { TrainMode } from "@/lib/settings";

interface QuestionGuideBodyProps {
  mode: TrainMode;
}

/**
 * 入门答疑抽屉：目标是「完全没学过乐理也能知道这一页怎么用」。
 * 按「练什么 → 先懂这几个词 → 怎么作答 → 常踩的坑」四段展开。
 * 随机小知识不放在这里，那是主区那行提示的职责。
 */
export function QuestionGuideBody({ mode }: QuestionGuideBodyProps) {
  const content = MODE_CONTENT[mode];

  return (
    <div className="space-y-6 text-sm">
      <p className="rounded-lg bg-muted/60 px-3 py-2.5 leading-relaxed">{content.intro}</p>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-medium">1</span>
          先弄懂这几个词
        </h3>
        <dl className="space-y-2">
          {content.concepts.map((concept) => (
            <div key={concept.term} className="rounded-lg border px-3 py-2">
              <dt className="font-medium">{concept.term}</dt>
              <dd className="mt-1 leading-relaxed text-muted-foreground">{concept.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-medium">2</span>
          这一页怎么作答
        </h3>
        <p className="leading-relaxed">{content.question}</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-muted-foreground">
          {content.how.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-medium">3</span>
          新手常踩的坑
        </h3>
        <ul className="space-y-1.5">
          {content.pitfalls.map((item) => (
            <li key={item} className="flex gap-2 leading-relaxed text-muted-foreground">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
