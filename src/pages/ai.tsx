import { useCallback, useRef, useState } from "react";
import http from "@/lib/http/axios";
import {
  CONTRACE_ADDRESS,
  DEFAULT_MODEL,
  AI_SYSTEM_PROMPT,
  AI_USER_PROMPT,
} from "@/const";
import { IPFS_GATEWAY, pinJSONToIPFS } from "@/lib/pinata";
import { Typewriter } from "@/components/Typewriter";
import { motion } from "framer-motion";
import { OperateBar } from "@/components/OperateBar";
import { Message, ModelResponse, TurnType } from "@/types/type";
import { WriteBar } from "@/components/WriteBar";
import { useAccount, useConnect, useWriteContract } from "wagmi";
import ABI from "@/lib/abis/NFTFactory.json";
import { injected } from "wagmi/connectors";
import { cn } from "@/lib/utils";

function AI() {
  const [turnType, setTurnType] = useState<TurnType>("do");
  const [fetching, setFetching] = useState<boolean>(false);
  const [writing, setWriting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: AI_SYSTEM_PROMPT,
    },
    { role: "user", content: AI_USER_PROMPT },
  ]);

  const { connectAsync } = useConnect();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const sendMessage = useCallback(async (messages: Message[]) => {
    try {
      setFetching(true);

      const { data } = await http.post<ModelResponse>(
        "/api/paas/v4/chat/completions",
        {
          model: DEFAULT_MODEL,
          messages,
          temperature: 0.8,
        }
      );

      if (data.choices.length > 0) {
        setMessages([...messages, data.choices[0].message]);
      }
    } finally {
      setFetching(false);
    }
  }, []);

  const generateNFT = async () => {
    if (!isConnected) {
      await connectAsync({ connector: injected() });
    }
    const res: { IpfsHash: string } = await pinJSONToIPFS(messages);
    console.log("🐞 => onUploadIPFS => res:", IPFS_GATEWAY + res.IpfsHash);
    const txRes = await writeContractAsync({
      address: CONTRACE_ADDRESS,
      abi: ABI,
      functionName: "createNFT",
      args: [address, res.IpfsHash],
    });
    console.log("🐞 => generateNFT => txRes:", txRes);
  };

  return (
    <>
      <div className="fixed top-0 w-full h-36 bg-gradient-to-b from-slate-950 to-transparent" />

      <main className="w-full max-w-screen-md mx-auto text-white flex-1 px-4 pt-24">
        <div className="flex flex-col gap-2">
          {messages.map((msg) => {
            if (msg.role === "user" && msg.content !== "续写") {
              return (
                <p
                  className={cn(
                    "indent-8 hover:underline hover:decoration-dotted text-gray-300",
                    {
                      "underline decoration-wavy":
                        msg.content !== AI_USER_PROMPT,
                    }
                  )}
                >
                  {msg.content}
                </p>
              );
            }
            if (msg.role === "assistant") {
              return (
                <Typewriter
                  className="indent-8 hover:underline hover:decoration-dotted"
                  text={msg.content}
                />
              );
            }
          })}
        </div>
      </main>

      <section className="w-full max-w-screen-md mx-auto p-6">
        {fetching && (
          <div className="flex space-x-2 justify-center items-center">
            <span className="sr-only">Loading...</span>
            <div className="h-4 w-4 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="h-4 w-4 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="h-4 w-4 bg-white rounded-full animate-bounce"></div>
          </div>
        )}
        {!fetching && !writing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <OperateBar
              retryVisible={messages.length >= 2}
              eraseVisible={messages.length >= 2}
              generateNFTVisible={messages.length >= 2}
              onTakeATurn={() => setWriting(true)}
              onContinue={() => {
                sendMessage([...messages, { role: "user", content: "续写" }]);
              }}
              onRetry={async () => {
                const retryMessages = [...messages];
                retryMessages.splice(-1);
                setMessages(retryMessages);
                await sendMessage(retryMessages);
              }}
              onErase={() => {
                const eraseMessages = [...messages];
                eraseMessages.splice(-2);
                setMessages(eraseMessages);
              }}
              onGenerateNFT={() => generateNFT()}
            />
          </motion.div>
        )}

        {!fetching && writing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <WriteBar
              ref={inputRef}
              turnType={turnType}
              onChooseTurnType={(type) => setTurnType(type)}
              onConfirm={async () => {
                if (!inputRef.current) return;

                if (inputRef.current.value.trim() === "") return;

                let content = "";

                const value = inputRef.current.value;
                switch (turnType) {
                  case "do":
                    content = `你${value}`;
                    break;
                  case "say":
                    content = `你说:“${value}”`;
                    break;
                  case "see":
                    content = `你看见了${value}`;
                    break;
                  case "story":
                    content = value;
                    break;
                }

                const newMsg: Message[] = [
                  ...messages,
                  { role: "user", content },
                ];
                setMessages(newMsg);
                await sendMessage(newMsg);

                inputRef.current.value = "";
              }}
              onExit={() => setWriting(false)}
            />
          </motion.div>
        )}
      </section>
    </>
  );
}

export default AI;
