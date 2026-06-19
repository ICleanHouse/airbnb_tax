// Small shared presentational components for the Host Cleaners UI kit.
const { useState } = React;

function Icon({ name, className }) {
  // Lucide is loaded globally; render a placeholder <i> that lucide replaces.
  return <i data-lucide={name} className={className}></i>;
}

function RatingStars({ rating, count, size = 14, showValue = true }) {
  const rounded = Math.round(rating || 0);
  return (
    <span className="rating-stars">
      <span className="rating-stars-row" style={{ fontSize: size }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= rounded ? "host-star--on" : "host-star--off"} style={{ fontSize: size }}>★</span>
        ))}
      </span>
      {showValue && (
        <span className="rating-stars-value">
          {rating > 0 ? rating.toFixed(1) : "New"}
          {count > 0 && <span className="rating-stars-count"> · {count} job{count === 1 ? "" : "s"}</span>}
        </span>
      )}
    </span>
  );
}

function Avatar({ name, size = 56, className = "cleaner-card-avatar" }) {
  return <span className={className} style={{ width: size, height: size, fontSize: size * 0.32 }}>{window.KIT.initials(name)}</span>;
}

function BrandMark({ label = true }) {
  return (
    <span className="site-brand">
      <img className="brand-mark" src="../../assets/mark.svg" width="34" height="34" alt="" />
      {label && <span>Host Cleaners</span>}
    </span>
  );
}

function Badge({ status }) {
  const map = {
    draft: ["b-draft", "Draft"], open: ["b-open", "Open"],
    assigned: ["b-assigned", "Assigned"], completed: ["b-completed", "Completed"],
  };
  const [cls, label] = map[status] || ["b-draft", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

Object.assign(window, { Icon, RatingStars, Avatar, BrandMark, Badge });
