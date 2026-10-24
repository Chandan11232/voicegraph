import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { Icon, KIND_LABELS } from "../icons.jsx";

function InlineEdit({ value, onDone, className }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save) => onDone(save ? text.trim() : null);
  return (
    <input
      ref={ref}
      className={`inline-edit nodrag ${className || ""}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

export const ArchNode = memo(function ArchNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const updateInternals = useUpdateNodeInternals();
  const vertical = data.direction === "TB";

  useEffect(() => updateInternals(id), [id, vertical, updateInternals]);

  const classes = ["arch-node", `kind-${data.kind}`, data.color && `color-${data.color}`, selected && "selected", data.finding && `finding-${data.finding}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onDoubleClick={() => setEditing(true)} title={editing ? undefined : "Drag to move · double-click to rename"}>
      <Handle type="target" position={vertical ? Position.Top : Position.Left} />
      <div className="arch-icon"><Icon name={data.kind} size={20} /></div>
      <div className="arch-text">
        {editing ? (
          <InlineEdit
            value={data.label}
            onDone={(label) => {
              setEditing(false);
              if (label && label !== data.label) data.onRename(id, label);
            }}
          />
        ) : (
          <div className="arch-label">{data.label}</div>
        )}
        <div className="arch-meta">{data.tech || KIND_LABELS[data.kind]}</div>
      </div>
      {data.finding && <span className="finding-dot" aria-label={`${data.finding} severity finding`} />}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} />
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className={`group-node${selected ? " selected" : ""}`}>
      <div className="group-label" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <InlineEdit
            value={data.label}
            onDone={(label) => {
              setEditing(false);
              if (label && label !== data.label) data.onRename(id, label);
            }}
          />
        ) : (
          data.label
        )}
      </div>
    </div>
  );
});

export const nodeTypes = { arch: ArchNode, group: GroupNode };
