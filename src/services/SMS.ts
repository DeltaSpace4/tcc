import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { auth, db } from "../../FirebaseConfig";

export type SmsLinkReport = {
  messageId: string;
  sender: string;
  receivedAt: number;
  links: string[];
};

type SyncResult = {
  permissionGranted: boolean;
  permissionStatus: string;
  savedCount: number;
};

type SmsReaderNativeModule = {
  readMessagesWithLinks(afterTimestamp: number): Promise<SmsLinkReport[]>;
};

const smsReader = NativeModules.SmsReader as SmsReaderNativeModule | undefined;
const scanTimestampKey = (userId: string) => `@tcc/sms-scan-timestamp/${userId}`;
let activeSmsSync: Promise<SyncResult> | null = null;

export async function getSmsLinkReports(): Promise<SmsLinkReport[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("É necessário entrar na conta para consultar as mensagens denunciadas.");
  }

  const reportsSnapshot = await getDocs(
    collection(db, "users", user.uid, "smsLinkReports"),
  );

  return reportsSnapshot.docs
    .map((reportDocument) => reportDocument.data())
    .filter((report): report is SmsLinkReport => {
      return (
        typeof report.messageId === "string" &&
        typeof report.sender === "string" &&
        typeof report.receivedAt === "number" &&
        Number.isFinite(report.receivedAt) &&
        Array.isArray(report.links) &&
        report.links.every((link): link is string => typeof link === "string")
      );
    })
    .map((report) => ({
      messageId: report.messageId,
      sender: report.sender,
      receivedAt: report.receivedAt,
      links: report.links,
    }))
    .sort((first, second) => second.receivedAt - first.receivedAt);
}

export function syncIncomingSmsWithLinks(): Promise<SyncResult> {
  if (!activeSmsSync) {
    activeSmsSync = syncMessagesWithLinks().finally(() => {
      activeSmsSync = null;
    });
  }

  return activeSmsSync;
}

async function syncMessagesWithLinks(): Promise<SyncResult> {
  if (Platform.OS !== "android") {
    throw new Error("A leitura de mensagens recebidas só está disponível no Android.");
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("É necessário entrar na conta para denunciar mensagens.");
  }

  const smsPermission = PermissionsAndroid.PERMISSIONS.READ_SMS;
  const permissionGranted = await PermissionsAndroid.check(smsPermission);
  const permissionStatus = permissionGranted
    ? PermissionsAndroid.RESULTS.GRANTED
    : await PermissionsAndroid.request(smsPermission, {
      title: "Permissão para acessar mensagens",
      message:
        "O app precisa ler as mensagens recebidas para identificar links e incluí-los na denúncia.",
      buttonPositive: "Permitir",
      buttonNegative: "Agora não",
    });

  if (permissionStatus !== PermissionsAndroid.RESULTS.GRANTED) {
    return { permissionGranted: false, permissionStatus, savedCount: 0 };
  }

  if (!smsReader) {
    throw new Error(
      "O leitor de mensagens não está disponível. Recompile o app Android para incluir a integração nativa.",
    );
  }

  const storedTimestamp = await AsyncStorage.getItem(scanTimestampKey(user.uid));
  const lastScanTimestamp = storedTimestamp ? Number(storedTimestamp) : 0;
  const afterTimestamp = Number.isFinite(lastScanTimestamp) ? lastScanTimestamp : 0;
  const scanStartedAt = Date.now();
  const messages = await smsReader.readMessagesWithLinks(afterTimestamp);
  let savedCount = 0;

  for (const message of messages) {
    const reportId = encodeURIComponent(message.messageId);
    if (
      !message.messageId ||
      !Number.isFinite(message.receivedAt) ||
      message.links.length === 0
    ) {
      continue;
    }

    const reportDocument = doc(
      db,
      "users",
      user.uid,
      "smsLinkReports",
      reportId,
    );
    const existingReport = await getDoc(reportDocument);
    if (existingReport.exists()) {
      continue;
    }

    await setDoc(reportDocument, {
      messageId: message.messageId,
      sender: message.sender,
      receivedAt: message.receivedAt,
      links: message.links,
      reportedAt: serverTimestamp(),
    });
    savedCount += 1;
  }

  await AsyncStorage.setItem(scanTimestampKey(user.uid), String(scanStartedAt));

  return {
    permissionGranted: true,
    permissionStatus: PermissionsAndroid.RESULTS.GRANTED,
    savedCount,
  };
}