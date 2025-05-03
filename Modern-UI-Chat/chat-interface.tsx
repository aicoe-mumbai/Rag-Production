"use client"

import "ios-vibrator-pro-max"

import React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import {
  Lightbulb,
  ArrowUp,
  Menu,
  RefreshCw,
  Copy,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Moon,
  Sun,
  FileSpreadsheet,
  FileText,
  File,
  Paperclip,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useTheme } from "@/hooks/use-theme"
import { useToast } from "@/hooks/use-toast"
import * as XLSX from "xlsx"
import Papa from "papaparse"
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import { 
  processFile, 
  vectorizeText, 
  findRelevantChunks,
  checkPythonServer
} from '@/lib/python-api';
import { ProcessedChunk, FileType, ProcessedDocument } from '@/types/document';

const TGI_SERVER_URL = process.env.NEXT_PUBLIC_TGI_SERVER_URL || 'http://172.16.34.235:8080/v1/chat/completions ';
type ActiveButton = "none" | "think"
type MessageType = "user" | "system" | "file"

interface FileData {
  name: string
  type: FileType
  content: string | string[][] | ArrayBuffer
  processed?: {
    originalContent: string
    previewContent: string
    chunks: ProcessedChunk[]
  }
  mimeType?: string
}

interface Message {
  id: string
  content: string
  type: MessageType
  completed?: boolean
  newSection?: boolean
  fileData?: FileData
}

interface MessageSection {
  id: string
  messages: Message[]
  isNewSection: boolean
  isActive?: boolean
  sectionIndex: number
}

interface StreamingWord {
  id: number
  text: string
}

// Configuration
const WORD_DELAY = 40 // ms per word
const CHUNK_SIZE = 2 // Number of words to add at once
const SIMILARITY_THRESHOLD = 0.7 // Threshold for selecting relevant chunks
const MAX_CONTEXT_CHUNKS = 5 // Max number of chunks to send as context

const isBrowser = typeof window !== 'undefined'

export default function ChatInterface() {
  const [inputValue, setInputValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const newSectionRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hasTyped, setHasTyped] = useState(false)
  const [activeButton, setActiveButton] = useState<ActiveButton>("none")
  const [isMobile, setIsMobile] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageSections, setMessageSections] = useState<MessageSection[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingWords, setStreamingWords] = useState<StreamingWord[]>([])
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [completedMessages, setCompletedMessages] = useState<Set<string>>(new Set())
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const shouldFocusAfterStreamingRef = useRef(false)
  const mainContainerRef = useRef<HTMLDivElement>(null)
  // Store selection state
  const selectionStateRef = useRef<{ start: number | null; end: number | null }>({ start: null, end: null })
  const { theme, toggleTheme } = useTheme()
  const { toast } = useToast()
  // Store processed file data globally for context
  const [allProcessedChunks, setAllProcessedChunks] = useState<ProcessedChunk[]>([])
  const lastCompletedMessageRef = useRef<HTMLDivElement>(null)
  // Python server status
  const [isPythonServerAvailable, setIsPythonServerAvailable] = useState<boolean>(false)
  // Track conversation history for context
  const [conversationHistory, setConversationHistory] = useState<{role: string, content: string}[]>([])

  // Constants for layout calculations to account for the padding values
  const HEADER_HEIGHT = 48 // 12px height + padding
  const INPUT_AREA_HEIGHT = 100 // Approximate height of input area with padding
  const TOP_PADDING = 48 // pt-12 (3rem = 48px)
  const BOTTOM_PADDING = 128 // pb-32 (8rem = 128px)
  const ADDITIONAL_OFFSET = 16 // Reduced offset for fine-tuning

  // Check Python server on mount
  useEffect(() => {
    if (!isBrowser) return;
    
    const checkServer = async () => {
      const isAvailable = await checkPythonServer();
      setIsPythonServerAvailable(isAvailable);
      
      if (!isAvailable) {
        toast({
          title: "Python Server Unavailable",
          description: "File processing will be limited. Please start the Python server with 'npm run dev'.",
          variant: "destructive",
          duration: 5000,
        });
      }
    };
    
    checkServer();
  }, [toast]);

  // Check if device is mobile and get viewport height
  useEffect(() => {
    if (!isBrowser) return;

    const checkMobileAndViewport = () => {
      const isMobileDevice = window.innerWidth < 768
      setIsMobile(isMobileDevice)

      // Capture the viewport height
      const vh = window.innerHeight
      setViewportHeight(vh)

      // Apply fixed height to main container on mobile
      if (isMobileDevice && mainContainerRef.current) {
        mainContainerRef.current.style.height = `${vh}px`
      }
    }

    checkMobileAndViewport()

    // Set initial height
    if (mainContainerRef.current) {
      mainContainerRef.current.style.height = isMobile ? `${viewportHeight}px` : "100svh"
    }

    // Update on resize
    window.addEventListener("resize", checkMobileAndViewport)

    return () => {
      window.removeEventListener("resize", checkMobileAndViewport)
    }
  }, [isMobile, viewportHeight])

  // Initialize highlight.js
  useEffect(() => {
    if (!isBrowser) return;
    
    hljs.configure({
      languages: ['javascript', 'typescript', 'python', 'jsx', 'tsx', 'html', 'css', 'json', 'bash'],
      ignoreUnescapedHTML: true
    });
  }, []);

  // Organize messages into sections
  useEffect(() => {
    if (messages.length === 0) {
      setMessageSections([])
      setActiveSectionId(null)
      return
    }

    const sections: MessageSection[] = []
    let currentSection: MessageSection = {
      id: `section-${Date.now()}-0`,
      messages: [],
      isNewSection: false,
      sectionIndex: 0,
    }

    messages.forEach((message) => {
      if (message.newSection) {
        // Start a new section
        if (currentSection.messages.length > 0) {
          // Mark previous section as inactive
          sections.push({
            ...currentSection,
            isActive: false,
          })
        }

        // Create new active section
        const newSectionId = `section-${Date.now()}-${sections.length}`
        currentSection = {
          id: newSectionId,
          messages: [message],
          isNewSection: true,
          isActive: true,
          sectionIndex: sections.length,
        }

        // Update active section ID
        setActiveSectionId(newSectionId)
      } else {
        // Add to current section
        currentSection.messages.push(message)
      }
    })

    // Add the last section if it has messages
    if (currentSection.messages.length > 0) {
      sections.push(currentSection)
    }

    setMessageSections(sections)
  }, [messages])

  // Scroll to maximum position when new section is created, but only for sections after the first
  useEffect(() => {
    if (messageSections.length > 1) {
      setTimeout(() => {
        const scrollContainer = chatContainerRef.current

        if (scrollContainer) {
          // Scroll to maximum possible position
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: "smooth",
          })
        }
      }, 100)
    }
  }, [messageSections])

  // Focus the textarea on component mount (only on desktop)
  useEffect(() => {
    if (textareaRef.current && !isMobile) {
      textareaRef.current.focus()
    }
  }, [isMobile])

  // Set focus back to textarea after streaming ends (only on desktop)
  useEffect(() => {
    if (!isStreaming && shouldFocusAfterStreamingRef.current && !isMobile) {
      focusTextarea()
      shouldFocusAfterStreamingRef.current = false
    }
  }, [isStreaming, isMobile])

  // Calculate available content height (viewport minus header and input)
  const getContentHeight = () => {
    // Calculate available height by subtracting the top and bottom padding from viewport height
    return viewportHeight - TOP_PADDING - BOTTOM_PADDING - ADDITIONAL_OFFSET
  }

  // Save the current selection state
  const saveSelectionState = () => {
    if (textareaRef.current) {
      selectionStateRef.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
      }
    }
  }

  // Restore the saved selection state
  const restoreSelectionState = () => {
    const textarea = textareaRef.current
    const { start, end } = selectionStateRef.current

    if (textarea && start !== null && end !== null) {
      // Focus first, then set selection range
      textarea.focus()
      textarea.setSelectionRange(start, end)
    } else if (textarea) {
      // If no selection was saved, just focus
      textarea.focus()
    }
  }

  const focusTextarea = () => {
    if (textareaRef.current && !isMobile) {
      textareaRef.current.focus()
    }
  }

  const handleInputContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only focus if clicking directly on the container, not on buttons or other interactive elements
    if (
      e.target === e.currentTarget ||
      (e.currentTarget === inputContainerRef.current && !(e.target as HTMLElement).closest("button"))
    ) {
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }
  }

  // Function to find relevant chunks based on user query
  const findRelevantChunksLocal = useCallback(async (query: string): Promise<ProcessedChunk[]> => {
    console.log("findRelevantChunksLocal called with query:", query);
    console.log("Current allProcessedChunks:", allProcessedChunks.length, "chunks available");
    
    if (allProcessedChunks.length === 0) {
      console.log("No processed chunks available");
      return [];
    }

    try {
      // If Python server is available, use it
      if (isPythonServerAvailable) {
        console.log("Using Python server to find relevant chunks");
        try {
          const result = await findRelevantChunks(query, allProcessedChunks, SIMILARITY_THRESHOLD, MAX_CONTEXT_CHUNKS);
          console.log("Python server returned relevant chunks:", result.relevantChunks.length);
          
          // If we got relevant chunks, return them
          if (result.relevantChunks && result.relevantChunks.length > 0) {
            return result.relevantChunks;
          } else {
            // If no relevant chunks from the server despite having documents, use recent chunks as fallback
            console.log("No relevant chunks returned by server, using fallback method");
          }
        } catch (pythonServerError) {
          console.error("Error from Python server:", pythonServerError);
          console.log("Using fallback chunk retrieval method");
        }
      } 
      
      // Fallback method - use the most recent chunks
      console.log("Using fallback method to find relevant chunks");
      
      // Sort chunks by order of addition (simplification: just use the last MAX_CONTEXT_CHUNKS)
      const recentChunks = [...allProcessedChunks].slice(-MAX_CONTEXT_CHUNKS);
      
      console.log(`Fallback: Using ${recentChunks.length} most recent chunks`);
      return recentChunks;
    } catch (error) {
      console.error("Error finding relevant chunks:", error);
      // Return a few recent chunks as last resort
      return allProcessedChunks.slice(-3);
    }
  }, [allProcessedChunks, isPythonServerAvailable]);

  // Add a function to ensure feedback buttons are visible
  const scrollToEnsureFeedbackButtonsVisible = () => {
    // Extra padding to ensure the buttons are fully visible
    const EXTRA_PADDING = 200; // Increased to 200px for better visibility

    setTimeout(() => {
      if (lastCompletedMessageRef.current && chatContainerRef.current && inputContainerRef.current) {
        const feedbackButtonsRect = lastCompletedMessageRef.current.getBoundingClientRect();
        const inputContainerRect = inputContainerRef.current.getBoundingClientRect();

        if (inputContainerRect && feedbackButtonsRect.bottom > inputContainerRect.top) {
          // Calculate how much additional scrolling is needed
          const additionalScroll = feedbackButtonsRect.bottom - inputContainerRect.top + EXTRA_PADDING;

          // Use smooth scrolling for better user experience
          chatContainerRef.current.scrollBy({
            top: additionalScroll,
            behavior: 'smooth'
          });
        }
      }
    }, 500); // Increased delay to ensure DOM is fully updated
  }

  const handleAIResponse = async (userMessage: string) => {
    // Create a new message with empty content
    const messageId = Date.now().toString()
    setStreamingMessageId(messageId)

    // Find relevant context from processed documents
    console.log("Finding relevant context for message:", userMessage);
    console.log("All processed chunks available:", allProcessedChunks.length);
    const relevantContextChunks = await findRelevantChunksLocal(userMessage);
    console.log("Relevant context chunks found:", relevantContextChunks.length);
    
    // Debug the content of relevant chunks 
    if (relevantContextChunks.length > 0) {
      console.log("Document context that will be sent to AI:");
      relevantContextChunks.forEach((chunk, i) => {
        console.log(`Chunk ${i}: ${chunk.text.substring(0, 100)}...`);
      });
    } else {
      console.warn("NO DOCUMENT CONTEXT FOUND - AI will respond without document knowledge");
    }

    // Add user message to conversation history
    const newUserMessage = {role: "user", content: userMessage};
    setConversationHistory(prev => [...prev.slice(-4), newUserMessage]); // Keep last 4 messages for context

    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        content: "", // Start empty
        type: "system",
      },
    ])

    // Add a delay before the second vibration
    setTimeout(() => {
      // Add vibration when streaming begins
      // // navigator.vibrate(50)
    }, 200)

    // Auto-scroll to the bottom when response starts
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }

    try {
      // Reset streaming words and set streaming state
      setStreamingWords([]);
      setIsStreaming(true);

      // Track word count for periodic scrolling
      let wordCount = 0;
      let streamedContent = ""; // Accumulate streamed content

      // Prepare the full prompt with document context
      const contextPrompt = relevantContextChunks.length > 0 
        ? `Context from uploaded documents:\n---\n${relevantContextChunks.map(chunk => chunk.text).join('\n\n')}\n---\n\nUser Question: ${userMessage}`
        : userMessage;
        
      console.log("Sending to AI model:", contextPrompt.substring(0, 200) + "...");

      // keep track of whether we’ve seen the closing </think> yet
      let skippingThink = true;

      function filterStreamedChunk(raw: string): string {
        if (!skippingThink) {
          // once we’re past the </think>, let everything through
          return raw;
        }

        // look for the end tag
        const endIdx = raw.indexOf('</think>');
        if (endIdx !== -1) {
          // drop everything up to and including </think>
          skippingThink = false;
          return raw.slice(endIdx + '</think>'.length);
        }

        // we’re still in the “thought” section → swallow it
        return '';
      }

      // Build messages array with system prompt, history, and current message
      const systemPrompt = {
        role: "system",
        content: `You are a technical AI assistant designed to provide accurate, factual, and helpful information. Your primary goal is to assist users with their technical queries while maintaining a professional tone. Here are some guidelines to follow:

        1. **Technical Accuracy**: Focus on providing technically accurate and factual information. Cite sources or references when appropriate.
        2. **Clarity and Precision**: Keep explanations clear, precise, and to the point. Use technical terminology appropriately.
        3. **Context Awareness**: Consider the context of the conversation and remember previous questions to provide relevant follow-up responses.
        4. **Code Quality**: When providing code examples, ensure they follow best practices, are well-commented, and are syntactically correct.
        5. **Problem-Solving Approach**: Break down complex problems into manageable steps or components.
        6. **No Personal Information**: Do not ask for or share personal information. Maintain user privacy and confidentiality.
        7. **Professional Tone**: Maintain a professional and respectful tone in all interactions.
        8. **Documentation References**: Refer to official documentation or resources when relevant.
        9. **Stay On Topic**: Keep the conversation relevant to the user's query or topic.
        10. **Admit Limitations**: If you're unsure about something, acknowledge it rather than providing potentially incorrect information.
        Don't think on answering
`
      };

      // Add document context to the latest user message if available
      const messagesForAI = [systemPrompt];
      
      // Add conversation history if it exists
      if (conversationHistory.length > 1) {
        // Add previous conversation history (not including the current message)
        messagesForAI.push(...conversationHistory.slice(0, -1));
      }
      
      // Add the current user message with document context if available
      if (relevantContextChunks.length > 0) {
        messagesForAI.push({
          role: "user",
          content: contextPrompt
        });
      } else {
        // Just add the current user message without special context
        messagesForAI.push({
          role: "user", 
          content: userMessage
        });
      }
        
      // Call AI with relevant chunks and conversation history
      await fetch(TGI_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "tgi",
          messages: messagesForAI,
          max_tokens: 1500,
          stream: true,
        }),
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is null');
        
        const decoder = new TextDecoder();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // Process SSE data format
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                // Skip [DONE] line
                if (line.includes('[DONE]')) continue;
                
                try {
                  // Parse the JSON data
                  const jsonData = JSON.parse(line.substring(6));
                  
                  // Extract the content chunk from the response
                  if (jsonData.choices && jsonData.choices.length > 0) {
                    const contentChunk = jsonData.choices[0].delta?.content || jsonData.choices[0].message?.content || '';
                    if (contentChunk) {
                      const clean = filterStreamedChunk(contentChunk);
                      if (clean) {
                      streamedContent += contentChunk;
                      setStreamingWords((prev) => [
                        ...prev,
                        {
                          id: Date.now() + Math.random(), // Ensure unique ID
                          text: contentChunk,
                        },
                      ]); }
                      
                      // Auto-scroll every 5 words to keep up with new content
                      wordCount++;
                      if (wordCount % 5 === 0 && chatContainerRef.current) {
                        requestAnimationFrame(() => {
                          if (chatContainerRef.current) {
                            chatContainerRef.current.scrollTo({
                              top: chatContainerRef.current.scrollHeight,
                              behavior: 'auto' // Use 'auto' for smoother continuous scrolling during streaming
                            });
                          }
                        });
                      }
                    }
                  }
                } catch (error) {
                  console.error('Error parsing SSE data:', error, line);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      });

      // Update the message content *after* streaming is complete
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, content: streamedContent, completed: true } : msg
        )
      );

      // Add assistant response to conversation history
      setConversationHistory(prev => [...prev, { role: "assistant", content: streamedContent }]);

      // Add to completed messages set to prevent re-animation
      setCompletedMessages((prev) => new Set(prev).add(messageId))

      // Final scroll after streaming completes to ensure all content is visible
      if (chatContainerRef.current) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
              top: chatContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });

            // After scrolling to end, ensure feedback buttons are visible
            scrollToEnsureFeedbackButtonsVisible();
          }
        }, 100);
      } else {
        // Ensure feedback buttons are visible after message completes
        scrollToEnsureFeedbackButtonsVisible();
      }
    } catch (error) {
      console.error("Error in AI response:", error)
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred."

      // Update with error message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: `Sorry, I encountered an error: ${errorMessage}`,
                completed: true,
              }
            : msg,
      ),
    )

      // Add to completed messages set
      setCompletedMessages((prev) => new Set(prev).add(messageId))

      // Ensure feedback buttons are visible after error message
      scrollToEnsureFeedbackButtonsVisible()
    }

    // Add vibration when streaming ends
    // navigator.vibrate(50)

    // Reset streaming state
    setStreamingWords([])
    setStreamingMessageId(null)
    setIsStreaming(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value

    // Only allow input changes when not streaming
    if (!isStreaming) {
      setInputValue(newValue)

      if (newValue.trim() !== "" && !hasTyped) {
        setHasTyped(true)
      } else if (newValue.trim() === "" && hasTyped) {
        setHasTyped(false)
      }

      const textarea = textareaRef.current
      if (textarea) {
        textarea.style.height = "auto"
        const newHeight = Math.max(24, Math.min(textarea.scrollHeight, 160))
        textarea.style.height = `${newHeight}px`
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim() && !isStreaming) {
      // Add vibration when message is submitted
      // navigator.vibrate(50)

      const userMessage = inputValue.trim()

      // Add as a new section if messages already exist
      const shouldAddNewSection = messages.length > 0

      const newUserMessage = {
        id: `user-${Date.now()}`,
        content: userMessage,
        type: "user" as MessageType,
        newSection: shouldAddNewSection,
      }

      // Reset input before starting the AI response
      setInputValue("")
      setHasTyped(false)
      setActiveButton("none")

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
      }

      // Add the message after resetting input
      setMessages((prev) => [...prev, newUserMessage])

      // Only focus the textarea on desktop, not on mobile
      if (!isMobile) {
        focusTextarea()
      } else {
        // On mobile, blur the textarea to dismiss the keyboard
        if (textareaRef.current) {
          textareaRef.current.blur()
        }
      }

      // Start AI response
      handleAIResponse(userMessage)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Cmd+Enter on both mobile and desktop
    if (!isStreaming && e.key === "Enter" && e.metaKey) {
      e.preventDefault()
      handleSubmit(e)
      return
    }

    // Only handle regular Enter key (without Shift) on desktop
    if (!isStreaming && !isMobile && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const toggleButton = (button: ActiveButton) => {
    if (!isStreaming) {
      // Save the current selection state before toggling
      saveSelectionState()

      setActiveButton((prev) => (prev === button ? "none" : button))

      // Restore the selection state after toggling
      setTimeout(() => {
        restoreSelectionState()
      }, 0)
    }
  }

  const handleAddButtonClick = () => {
    if (!isStreaming) {
      if (fileInputRef.current) {
        fileInputRef.current.click()
      }
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    const messageId = `file-${Date.now()}`;
    let fileType: FileType;
    let content: string | string[][] | ArrayBuffer;
    
    // Add initial file message
    addFileMessage(file.name, 'txt', '', messageId, true, file.type);
    
    try {
      if (file.type.includes('spreadsheet') || file.type.includes('excel') || file.name.endsWith('.csv')) {
        fileType = file.name.endsWith('.csv') ? 'csv' : 'xlsx';
        const data = await readFileAsArrayBuffer(file);
        if (file.name.endsWith('.csv')) {
          const parseResult = await new Promise<string[][]>((resolve) => {
            Papa.parse(file, {
              complete: (results) => resolve(results.data as string[][]),
            });
          });
          content = parseResult;
        } else {
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          content = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as string[][];
        }
      } else {
        fileType = 'txt';
        content = await readFileAsText(file);
      }
      
      let processedData: ProcessedDocument;
      if (isPythonServerAvailable) {
        try {
          const result = await processFile(file);
          processedData = {
            originalContent: content.toString(),
            previewContent: content.toString().substring(0, 1000),
            chunks: result.chunks,
            fileName: file.name,
            fileType: fileType
          };
          // Update chunks in global state
          setAllProcessedChunks(prev => [...prev, ...processedData.chunks]);
        } catch (err) {
          console.error('Error processing file with Python server:', err);
          processedData = await fallbackProcessFile(file, fileType);
        }
      } else {
        processedData = await fallbackProcessFile(file, fileType);
      }
      
      // Update file message with processed content
      updateFileMessage(
        messageId,
        file.name,
        fileType,
        content,
        processedData,
        file.type
      );
      
    } catch (err) {
      console.error('Error processing file:', err);
      toast({
        title: "Error processing file",
        description: "Failed to process the file. Please try again.",
        variant: "destructive",
      });
      removeMessage(messageId);
    }
    
    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isBrowser) {
        reject(new Error('File reading is only available in browser environment'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      if (!isBrowser) {
        reject(new Error('File reading is only available in browser environment'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // Fallback file processing for when Python server is unavailable
  const fallbackProcessFile = async (file: File, fileType: FileType): Promise<ProcessedDocument> => {
    const content = await readFileAsText(file);
    const chunkText = content.substring(0, 1000); // Use first 1000 chars for vectorization
    const vectorResult = await vectorizeText(chunkText);
    
    const chunks: ProcessedChunk[] = [{
      text: vectorResult.text,
      vector: vectorResult.vector
    }];
    
    return {
      originalContent: content,
      previewContent: chunkText,
      chunks,
      fileName: file.name,
      fileType
    };
  }

  // Adds or updates a file message
  const addOrUpdateFileMessage = (
    id: string,
    fileName: string,
    fileType: FileType,
    content: string | string[][] | ArrayBuffer,
    isProcessing: boolean,
    processedData?: {
      originalContent: string;
      previewContent: string;
      chunks: ProcessedChunk[];
    },
    mimeType?: string
  ) => {
    const fileData: FileData = {
      name: fileName,
      type: fileType,
      content,
      processed: processedData,
      mimeType
    };

    setMessages((prevMessages) => {
      const messageIndex = prevMessages.findIndex((msg) => msg.id === id);
      if (messageIndex === -1) {
        return [
          ...prevMessages,
          {
            id,
            type: "file",
            content: isProcessing ? "Processing file..." : "File processed",
            fileData,
          },
        ];
      } else {
        const newMessages = [...prevMessages];
        newMessages[messageIndex] = {
          ...newMessages[messageIndex],
          content: isProcessing ? "Processing file..." : "File processed",
          fileData,
        };
        return newMessages;
      }
    });
  };

  // Specific function to add a new file message (usually placeholder)
  const addFileMessage = (
      fileName: string,
      fileType: FileType,
      content: string | string[][] | ArrayBuffer,
      id: string,
      isProcessing: boolean,
      mimeType?: string
      ) => {
      addOrUpdateFileMessage(id, fileName, fileType, content, isProcessing, undefined, mimeType);
  }

  // Specific function to update a file message (after processing)
  const updateFileMessage = (
    id: string,
    fileName: string,
    fileType: FileType,
    content: string | string[][] | ArrayBuffer,
    processedData: ProcessedDocument,
    mimeType?: string
  ) => {
    const fileData: FileData = {
      name: fileName,
      type: fileType,
      content,
      processed: {
        originalContent: processedData.originalContent,
        previewContent: processedData.previewContent,
        chunks: processedData.chunks
      },
      mimeType
    };

    setMessages((prevMessages) => {
      const messageIndex = prevMessages.findIndex((msg) => msg.id === id);
      if (messageIndex === -1) {
        return prevMessages;
      }
      const newMessages = [...prevMessages];
      newMessages[messageIndex] = {
        ...newMessages[messageIndex],
        content: "File processed",
        fileData,
      };
      return newMessages;
    });
  };

  // Function to remove a message by ID
  const removeMessage = (id: string) => {
      setMessages(prev => prev.filter(msg => msg.id !== id));
  }

  const handleCopyText = async (text: string) => {
    if (!isBrowser) return;
    
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied to clipboard",
        description: "Text has been copied to your clipboard.",
      })
    } catch (err) {
      console.error("Failed to copy text:", err)
      toast({
        title: "Failed to copy",
        description: "Could not copy text to clipboard.",
        variant: "destructive",
      })
    }
  }

  const handleShareText = async (text: string) => {
    if (!isBrowser) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          text: text,
        })
        toast({
          title: "Shared successfully",
          description: "Content has been shared.",
        })
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Error sharing:", err)
          toast({
            title: "Failed to share",
            description: "Could not share the content.",
            variant: "destructive",
          })
        }
      }
    } else {
      handleCopyText(text)
    }
  }

  const handleFeedback = (messageId: string, isPositive: boolean) => {
    // Here you would typically send feedback to your backend
    console.log(`Feedback for message ${messageId}: ${isPositive ? "positive" : "negative"}`)

    toast({
      title: "Feedback received",
      description: `Thank you for your ${isPositive ? "positive" : "negative"} feedback!`,
    })
  }

  const refreshPage = () => {
    console.log("Clearing chat and document context");
    // Clear processed chunks first
    setAllProcessedChunks([]);
    // Clear conversation history
    setConversationHistory([]);
    // Then clear messages
    setMessages([]);
    // Clear streaming state if any
    setStreamingWords([]);
    setIsStreaming(false);
    setStreamingMessageId(null);
    // Clear sections
    setMessageSections([]);
    // Confirm with toast
    toast({ 
      title: "Chat Cleared", 
      description: "Document context and conversation have been cleared"
    });
  }

  // Function to format message content with bold text and code blocks
  const formatMessageContent = (content: string) => {
    if (!content) return null;
    
    // First handle code blocks
    const codeBlockRegex = /```([a-z]*)\n([\s\S]*?)```/g;
    let formattedContent = [];
    let lastIndex = 0;
    let match;
    
    // Find all code blocks
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textBeforeBlock = content.slice(lastIndex, match.index);
        formattedContent.push(
          <span key={`text-${lastIndex}`}>
            {formatBoldText(textBeforeBlock)}
          </span>
        );
      }
      
      // Add code block with syntax highlighting
      const language = match[1].trim() || 'plaintext';
      const code = match[2].trim();
      
      // Apply syntax highlighting
      let highlightedCode;
      try {
        if (language !== 'plaintext') {
          highlightedCode = hljs.highlight(code, { language }).value;
        } else {
          highlightedCode = hljs.highlightAuto(code).value;
        }
      } catch (e) {
        // Fallback if language mode fails
        highlightedCode = hljs.highlightAuto(code).value;
      }
      
      formattedContent.push(
        <div key={`code-${match.index}`} className="my-2 overflow-hidden rounded-md bg-gray-900 text-white">
          {language !== 'plaintext' && (
            <div className="bg-gray-800 px-4 py-1 text-xs text-gray-400">
              {language}
            </div>
          )}
          <pre className="p-4 overflow-x-auto">
            <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          </pre>
          <div className="relative">
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 h-7 w-7 rounded-md bg-gray-700 p-0"
              onClick={() => handleCopyText(code)}
              aria-label="Copy code"
            >
              <Copy className="h-3.5 w-3.5 text-gray-300" />
            </Button>
          </div>
        </div>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text after the last code block
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex);
      formattedContent.push(
        <span key={`text-end`}>
          {formatBoldText(remainingText)}
        </span>
      );
    }
    
    return formattedContent.length > 0 ? formattedContent : formatBoldText(content);
  };

  // Helper function to format bold text (using ** syntax)
  const formatBoldText = (text: string) => {
    if (!text) return text;
    
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Bold text - remove the ** markers and apply bold styling
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const renderFilePreview = (fileData: FileData) => {
    const getIcon = (type: FileType) => {
        switch (type) {
            case 'csv':
            case 'xlsx': return <FileSpreadsheet className="h-4 w-4 mr-2 flex-shrink-0" />;
            case 'pdf': return <FileText className="h-4 w-4 mr-2 flex-shrink-0" />;
            case 'docx': return <FileText className="h-4 w-4 mr-2 flex-shrink-0" />;
            case 'txt': return <FileText className="h-4 w-4 mr-2 flex-shrink-0" />;
            case 'json': return <FileText className="h-4 w-4 mr-2 flex-shrink-0" />;
            default: return <File className="h-4 w-4 mr-2 flex-shrink-0" />;
        }
    }

    const isProcessed = !!fileData.processed;
    const statusText = isProcessed ? `${fileData.processed?.chunks.length} chunks processed` : "Processing...";
    const statusColor = isProcessed ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400";
    
    // Determine if we should show a preview
    const hasPreview = isProcessed && fileData.processed?.previewContent;
    
    return (
        <div className="file-preview bg-gray-100 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="file-preview-header flex items-center justify-between mb-2">
            <div className="file-preview-title flex items-center text-sm font-medium text-gray-800 dark:text-gray-200">
              {getIcon(fileData.type)}
              <span className="truncate" title={fileData.name}>{fileData.name}</span>
            </div>
            <span className={`text-xs font-mono ${statusColor}`}>{statusText}</span>
          </div>
          
          {/* File content preview for processed files */}
          {hasPreview && (
            <div className="file-preview-content mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Preview:</div>
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                {fileData.processed?.previewContent}
              </div>
            </div>
          )}
        </div>
      );
  }

  return (
    <div
      ref={mainContainerRef}
      className={cn(
        "flex flex-col h-screen bg-background text-foreground transition-colors duration-200",
        theme,
        "overflow-hidden", // Prevent body scroll
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-10 h-12">
        <div className="flex items-center">
          {/* Replace with Menu icon */}
          <Button variant="ghost" size="icon" className="mr-2">
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">QwickChat</h1>
        </div>
        <div className="flex items-center space-x-2">
          {/* Python server status indicator */}
          {isPythonServerAvailable ? (
            <span className="text-xs text-green-500 mr-2">Python Server Active</span>
          ) : (
            <span className="text-xs text-red-500 mr-2">Python Server Inactive</span>
          )}
          {/* Refresh button */}
          <Button variant="ghost" size="icon" onClick={refreshPage} title="Clear Chat">
            <RefreshCw className="h-5 w-5" />
          </Button>
          {/* Theme toggle button */}
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle Theme">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Chat Content Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 pt-12 pb-32 relative scroll-smooth"
        style={{ maxHeight: `calc(${isMobile ? viewportHeight + "px" : "100vh"} - ${HEADER_HEIGHT}px - ${INPUT_AREA_HEIGHT}px)` }}
      >
        <div className="mx-auto max-w-3xl">
          {messageSections.map((section, sectionIndex) => (
            <div key={section.id} ref={section.isActive ? newSectionRef : null} className="mb-8 last:mb-0">
              {section.messages.map((message, msgIndex) => (
                <div
                  key={message.id}
                  className={cn("flex mb-4", {
                    "justify-end": message.type === "user",
                    "justify-start": message.type === "system" || message.type === "file",
                  })}
                >
                  <div
                    className={cn("p-3 rounded-lg shadow-sm", {
                      "bg-primary text-primary-foreground max-w-[80%]": message.type === "user",
                      "bg-muted text-foreground w-[80%]": message.type === "system", // Changed from text-black to text-foreground to respect dark mode
                      "w-full bg-muted border border-border": message.type === "file", // File messages styling
                    })}
                  >
                    {message.type === "file" && message.fileData ? (
                      renderFilePreview(message.fileData)
                    ) : message.type === "system" && streamingMessageId === message.id ? (
                      // Render streaming words
                      <div className="whitespace-pre-wrap break-words">
                        {streamingWords.map((word) => (
                          <span key={word.id}>{word.text}</span>
                        ))}
                        {/* Add blinking cursor during streaming */}
                        <span className="inline-block w-2 h-4 bg-primary animate-blink ml-1"></span>
                      </div>
                    ) : (
                      // Render completed message content with formatting
                      <div className="whitespace-pre-wrap break-words">
                        {message.type === "system" 
                          ? formatMessageContent(message.content) 
                          : message.content}
                      </div>
                    )}

                    {/* Feedback buttons for completed system messages */}
                    {message.type === "system" && message.completed && (
                      <div
                          ref={msgIndex === section.messages.length - 1 ? lastCompletedMessageRef : null} // Attach ref to the last message in the section
                          className="flex items-center justify-end space-x-2 mt-2 pt-2 border-t border-border/20"
                          >
                        <Button variant="ghost" size="icon" onClick={() => handleCopyText(message.content)} title="Copy">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleShareText(message.content)} title="Share">
                          <Share2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleFeedback(message.id, true)} title="Like">
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleFeedback(message.id, false)} title="Dislike">
                          <ThumbsDown className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div
        ref={inputContainerRef}
        className={cn(
          "sticky bottom-0 left-0 right-0 mt-auto p-4 bg-background border-t border-border",
          "transition-all duration-200 ease-in-out",
        )}
        onClick={handleInputContainerClick}
      >
        <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..." // Default placeholder
              className={cn(
                "w-full resize-none pr-20 py-3 pl-12 min-h-[50px] max-h-[160px] overflow-y-auto",
                "rounded-full border border-input bg-transparent shadow-sm",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              )}
              rows={1}
              disabled={isStreaming}
              style={{ height: "auto" }}
            />
            
            {/* Paperclip (upload) button inside the textarea */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full"
              onClick={handleAddButtonClick}
              disabled={isStreaming}
              title="Upload File"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            
            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".csv, .xlsx, .pdf, .docx, .txt"
            />

            {/* Submit Button */}
            <Button
              type="submit"
              size="icon"
              className={cn(
                "absolute right-3 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full",
                "transition-opacity duration-200 bg-primary text-primary-foreground",
                !hasTyped && "opacity-70"
              )}
              disabled={isStreaming || !inputValue.trim()}
              title="Send Message"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

