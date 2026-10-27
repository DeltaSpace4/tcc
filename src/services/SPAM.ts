import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { auth, db } from "../../FirebaseConfig";

const Historico = 100;
const SPAM = 6;
const BLOCK_AFTER_OCCURRENCES = 5;

export type ShortIncomingCall = {
  phoneNumber: string;
  durationSeconds: number;
  callTimestamp: number;
};

type SyncResult = {
  permissionGranted: boolean;
  permissionStatus: string;
  savedCount: number;
  blockedNumbersCount: number;
  callScreeningRoleGranted: boolean;
};

type CallScreeningNativeModule = {
  updateBlockedNumbers(userId: string, numbers: string[]): Promise<void>;
  isCallScreeningRoleHeld(): Promise<boolean>;
  requestCallScreeningRole(): Promise<boolean>;
};

const callScreening = NativeModules.SmsReader as
  | CallScreeningNativeModule
  | undefined;

export async function requestCallScreeningRole(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  if (!callScreening) {
    throw new Error(
      "O bloqueio de chamadas não está disponível. Recompile o app Android.",
    );
  }

  return callScreening.requestCallScreeningRole();
}

export async function getShortIncomingCalls(): Promise<ShortIncomingCall[]> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("É necessário entrar na conta para consultar as chamadas.");
  }

  const callsSnapshot = await getDocs(
    collection(db, "users", user.uid, "shortIncomingCalls"),
  );

  return callsSnapshot.docs
    .map((callDocument) => callDocument.data())
    .filter((call): call is ShortIncomingCall => {
      return (
        typeof call.phoneNumber === "string" &&
        call.phoneNumber.trim().length > 0 &&
        typeof call.durationSeconds === "number" &&
        call.durationSeconds >= 0 &&
        call.durationSeconds <= SPAM &&
        typeof call.callTimestamp === "number" &&
        Number.isFinite(call.callTimestamp)
      );
    })
    .map((call) => ({
      phoneNumber: call.phoneNumber.trim(),
      durationSeconds: call.durationSeconds,
      callTimestamp: call.callTimestamp,
    }))
    .sort((first, second) => second.callTimestamp - first.callTimestamp);
}

export async function syncShortIncomingCalls(): Promise<SyncResult> {
  if (Platform.OS !== "android") {
    throw new Error("A leitura do histórico de chamadas só está disponível no Android.");
  }

  const callLogPermission = PermissionsAndroid.PERMISSIONS.READ_CALL_LOG;
  const permissionGranted = await PermissionsAndroid.check(callLogPermission);
  const permissionStatus = permissionGranted
    ? PermissionsAndroid.RESULTS.GRANTED
    : await PermissionsAndroid.request(callLogPermission, {
        title: "Permissão para acessar chamadas",
        message:
          "O app precisa acessar o histórico de chamadas para identificar ligações recebidas suspeitas.",
        buttonPositive: "Permitir",
        buttonNegative: "Agora não",
      });

  if (permissionStatus !== PermissionsAndroid.RESULTS.GRANTED) {
    return {
      permissionGranted: false,
      permissionStatus,
      savedCount: 0,
      blockedNumbersCount: 0,
      callScreeningRoleGranted: false,
    };
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error("É necessário entrar na conta para salvar as chamadas.");
  }

  const { default: CallLogs } = await import("react-native-call-log");
  const calls = await CallLogs.load(Historico, {
    types: "INCOMING",
    maxDuration: SPAM,
  });

  let savedCount = 0;

  for (const call of calls) {
    if (
      call.type !== "INCOMING" ||
      call.duration < 0 ||
      call.duration > SPAM ||
      !call.id ||
      !call.phoneNumber?.trim()
    ) {
      continue;
    }

    const callDocument = doc(
      db,
      "users",
      user.uid,
      "shortIncomingCalls",
      encodeURIComponent(call.id),
    );
    const existingCall = await getDoc(callDocument);

    if (existingCall.exists()) {
      continue;
    }

    await setDoc(callDocument, {
      phoneNumber: call.phoneNumber.trim(),
      durationSeconds: call.duration,
      callTimestamp: Number(call.timestamp),
      savedAt: serverTimestamp(),
    });
    savedCount += 1;
  }

  const savedCallsSnapshot = await getDocs(
    collection(db, "users", user.uid, "shortIncomingCalls"),
  );
  const occurrenceCounts = new Map<string, { phoneNumber: string; count: number }>();

  for (const callDocument of savedCallsSnapshot.docs) {
    const phoneNumber = callDocument.data().phoneNumber;
    if (typeof phoneNumber !== "string") {
      continue;
    }

    const normalizedNumber = phoneNumber.replace(/\D/g, "");
    if (!normalizedNumber) {
      continue;
    }

    const occurrence = occurrenceCounts.get(normalizedNumber);
    if (occurrence) {
      occurrence.count += 1;
    } else {
      occurrenceCounts.set(normalizedNumber, { phoneNumber, count: 1 });
    }
  }

  const blockedNumberEntries = [...occurrenceCounts.entries()].filter(
    ([, occurrence]) => occurrence.count >= BLOCK_AFTER_OCCURRENCES,
  );
  const blockedNumbersCollection = collection(
    db,
    "users",
    user.uid,
    "blockedNumbers",
  );
  const existingBlockedNumbers = await getDocs(blockedNumbersCollection);
  const existingBlockedIds = new Set(
    existingBlockedNumbers.docs.map((blockedDocument) => blockedDocument.id),
  );
  const blockedNumbersById = new Map(
    blockedNumberEntries.map(([normalizedNumber, occurrence]) => [
      normalizedNumber,
      occurrence.phoneNumber,
    ]),
  );

  for (const [normalizedNumber, occurrence] of blockedNumberEntries) {
    if (existingBlockedIds.has(normalizedNumber)) {
      continue;
    }

    await setDoc(
      doc(blockedNumbersCollection, normalizedNumber),
      {
        phoneNumber: occurrence.phoneNumber,
        occurrences: occurrence.count,
        blockedAt: serverTimestamp(),
      },
    );
  }

  for (const blockedDocument of existingBlockedNumbers.docs) {
    const storedPhoneNumber = blockedDocument.data().phoneNumber;
    blockedNumbersById.set(
      blockedDocument.id,
      typeof storedPhoneNumber === "string"
        ? storedPhoneNumber
        : blockedDocument.id,
    );
  }

  if (!callScreening) {
    throw new Error(
      "O bloqueio de chamadas não está disponível. Recompile o app Android.",
    );
  }

  const blockedNumbers = [...blockedNumbersById.values()];
  await callScreening.updateBlockedNumbers(user.uid, blockedNumbers);
  const callScreeningRoleGranted =
    blockedNumbers.length > 0
      ? await callScreening.isCallScreeningRoleHeld()
      : false;

  return {
    permissionGranted: true,
    permissionStatus: PermissionsAndroid.RESULTS.GRANTED,
    savedCount,
    blockedNumbersCount: blockedNumbers.length,
    callScreeningRoleGranted,
  };
}
