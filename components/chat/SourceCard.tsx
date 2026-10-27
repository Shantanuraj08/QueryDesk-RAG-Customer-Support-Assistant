"use client";

import { useState } from "react";
import { BookOpen, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { Citation } from "./types";

interface SourceCardProps {
  citations: Citation[];
}

export function SourceCard({ citations }: SourceCardProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-md mt-3 border border-gray-200 rounded-xl p-3 bg-white shadow-2xs">
      <div className="flex items-center gap-1.5 text-gray-500 mb-2">
        <BookOpen size={13} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-700">Sources</span>
      </div>

      <div className="space-y-1.5">
        {citations.map((cite, index) => {
          const isExpanded = expandedIndex === index;
          const filename =
            cite.filename ||
            (cite.metadata?.source as string) ||
            "Document source";

          const page = cite.metadata?.page;
          const section = cite.metadata?.section;
          let subtitle = "";
          if (section && page) {
            subtitle = `${section} · Page ${page}`;
          } else if (section) {
            subtitle = String(section);
          } else if (page) {
            subtitle = `Page ${page}`;
          } else if (cite.score !== null && cite.score !== undefined) {
            subtitle = `Relevance: ${Math.round(cite.score * 100)}%`;
          } else {
            subtitle = cite.citation || "Reference excerpt";
          }

          return (
            <div
              key={index}
              className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50/50 hover:bg-gray-50 transition-colors"
            >
              <button
                type="button"
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full flex items-center justify-between p-2 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {filename}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {subtitle}
                    </p>
                  </div>
                </div>

                <div className="text-gray-400 shrink-0 ml-2">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-2.5 pb-2.5 pt-1 text-xs text-gray-600 border-t border-gray-100 bg-white">
                  <p className="text-[11px] text-gray-500 leading-relaxed italic">
                    {cite.snippet ||
                      (cite.metadata?.text as string) ||
                      (cite.metadata?.content as string) ||
                      "Source matched this section of the uploaded document."}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
