import { useEffect, useRef } from "react";

/** Lightweight rich text (bold / italic / lists) via contentEditable — spec §2.4. */
export function DescriptionEditor({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (!ref.current || seeded.current) return;
    ref.current.innerHTML = value;
    seeded.current = true;
  }, [value]);

  function run(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd, false);
    onChange(ref.current?.innerHTML ?? "");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.4rem" }}>
        <button type="button" className="btn btn-ghost" onClick={() => run("bold")}>
          Bold
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => run("italic")}>
          Italic
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => run("insertUnorderedList")}>
          List
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        style={{
          minHeight: "8rem",
          border: "1px solid color-mix(in srgb, var(--kp-teal) 25%, transparent)",
          borderRadius: "0.5rem",
          padding: "0.65rem 0.75rem",
          background: "#fffefb",
        }}
      />
    </div>
  );
}
